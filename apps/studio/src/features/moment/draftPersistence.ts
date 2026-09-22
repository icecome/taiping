import type { MomentDraft } from '../../features/moment/composeState'

const KEY = 'taiping:moment:draft'
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const DEBOUNCE_MS = 1000

interface StoredDraft {
  mode: 'creating' | 'editing'
  editingId: string | null
  draft: MomentDraft
  savedAt: number
}

/**
 * 说说草稿的本地暂存，用于页面刷新/意外关闭后的恢复。
 * 仅持久化已上传完成的图片；上传中或失败的图片在恢复时丢弃，
 * 避免留下无效的 blob/占位地址。
 */
export function saveDraft(
  mode: 'creating' | 'editing',
  editingId: string | null,
  draft: MomentDraft,
): void {
  try {
    const payload: StoredDraft = {
      mode,
      editingId,
      draft: {
        ...draft,
        pictures: draft.pictures.filter((p) => p.status === 'done'),
      },
      savedAt: Date.now(),
    }
    window.localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // localStorage 不可用（隐私模式/配额满）时静默降级，不影响主流程
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // 忽略
  }
}

export function loadDraft(): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    if (!parsed?.draft || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearDraft()
      return null
    }
    // 恢复时剔除未完成图片
    parsed.draft.pictures = (parsed.draft.pictures ?? []).filter(
      (p) => p.status === 'done',
    )
    // 空草稿不提示恢复
    if (!parsed.draft.contentMd.trim() && !parsed.draft.pictures.length) {
      clearDraft()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * 防抖写入。返回一个 cancel 函数用于在提交成功/取消后停止后续写入。
 */
export function createDebouncedSaver(delay = DEBOUNCE_MS) {
  let timer: number | undefined
  return {
    schedule(
      mode: 'creating' | 'editing',
      editingId: string | null,
      draft: MomentDraft,
    ) {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => saveDraft(mode, editingId, draft), delay)
    },
    cancel() {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
    },
  }
}
