<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
  }>(),
  { placeholder: '使用 Markdown 写作…' },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
const host = ref<HTMLDivElement | null>(null)
let editor: {
  getValue?: () => string
  setValue?: (v: string) => void
  destroy?: () => void
  setTheme?: (t: string) => void
} | null = null

const error = ref('')

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-overtype="1"]`)
    if (existing) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.dataset.overtype = '1'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('OverType 脚本加载失败'))
    document.head.appendChild(s)
  })
}

async function uploadFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/image-beds/upload', {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || '图片上传失败')
  }
  const url = (data as { result?: { url?: string } }).result?.url
  if (!url) throw new Error('未返回图片 URL')
  return `![${file.name}](${url})`
}

onMounted(async () => {
  if (!host.value) return
  try {
    await loadScript('/editor/overtype.min.js')
    // 延迟等待全局挂载
    await new Promise((r) => setTimeout(r, 30))
    const OT =
      (window as unknown as { OverType?: new (el: HTMLElement, opts?: unknown) => unknown }).OverType
    if (!OT) throw new Error('OverType 未初始化')
    const inst = new OT(host.value, {
      theme: 'solar',
      toolbar: true,
      autoResize: true,
      smartLists: true,
      minHeight: 420,
      placeholder: props.placeholder,
      fileUpload: {
        enabled: true,
        mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
        batch: true,
        onInsertFile: async (input: File | File[]) => {
          const files = Array.isArray(input) ? input : [input]
          const parts: string[] = []
          for (const f of files) {
            if (!f.type.startsWith('image/')) continue
            parts.push(await uploadFile(f))
          }
          return parts.join('\n\n')
        },
      },
    }) as {
      getValue: () => string
      setValue: (v: string) => void
      destroy?: () => void
    }
    editor = Array.isArray(inst) ? (inst[0] as typeof editor) : inst
    if (props.modelValue) editor?.setValue?.(props.modelValue)

    const ta = host.value.querySelector('textarea')
    ta?.addEventListener('input', () => {
      const v = editor?.getValue?.() ?? ''
      emit('update:modelValue', v)
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '编辑器加载失败'
  }
})

watch(
  () => props.modelValue,
  (v) => {
    if (editor && editor.getValue && editor.getValue() !== v) {
      editor.setValue?.(v)
    }
  },
)

onBeforeUnmount(() => {
  try {
    editor?.destroy?.()
  } catch {
    // ignore
  }
  editor = null
})
</script>

<template>
  <div>
    <div ref="host" class="overtype-host"></div>
    <p v-if="error" class="error" style="margin-top: 8px;">{{ error }}</p>
    <p class="muted" style="margin-top: 6px; font-size: 12px;">
      支持 Markdown / 粘贴或拖拽图片上传至图床
    </p>
  </div>
</template>

<style scoped>
.overtype-host {
  min-height: 420px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.overtype-host :deep(.overtype-container) {
  min-height: 420px;
}
</style>
