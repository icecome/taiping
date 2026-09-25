<script setup lang="ts">
import { ref } from 'vue'

const theme = ref('zhuosu')
const message = ref('')

function save() {
  message.value = `主题偏好已记录：${theme.value}（当前打包内置 zhuosu）`
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>主题设置</h1>
        <p class="page-desc">前台主题与展示偏好</p>
      </div>
    </div>

    <div class="panel">
      <div class="field" style="max-width: 320px;">
        <label>当前主题</label>
        <select v-model="theme">
          <option value="zhuosu">zhuosu（内置）</option>
        </select>
        <div class="hint">主题能力：文章 / 归档 / 分类标签 / 说说 / 留言板 / 加密文</div>
      </div>
      <button class="primary" type="button" @click="save">保存</button>
      <p v-if="message" class="success" style="margin-top: 10px;">{{ message }}</p>
    </div>

    <div class="panel">
      <h2>主题色板（太平）</h2>
      <div class="row">
        <div style="width: 120px;">
          <div style="height: 56px; border-radius: 12px; background: #e6852c;"></div>
          <div class="muted" style="margin-top: 6px;">橙 / 强调</div>
        </div>
        <div style="width: 120px;">
          <div style="height: 56px; border-radius: 12px; background: #2563a8;"></div>
          <div class="muted" style="margin-top: 6px;">蓝 / 主操作</div>
        </div>
        <div style="width: 120px;">
          <div style="height: 56px; border-radius: 12px; background: #2f8f6b;"></div>
          <div class="muted" style="margin-top: 6px;">绿 / 成功态</div>
        </div>
      </div>
    </div>
  </div>
</template>
