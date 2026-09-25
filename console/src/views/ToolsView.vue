<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api'

const importText = ref('')
const result = ref('')
const error = ref('')

async function runImport() {
  result.value = ''
  error.value = ''
  try {
    const payload = JSON.parse(importText.value)
    const { summary } = await api.importMessages(payload)
    result.value = `导入完成：${JSON.stringify(summary)}`
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导入失败'
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>工具</h1>
        <p class="page-desc">数据导入与维护</p>
      </div>
    </div>

    <div class="panel">
      <h2>导入 blog-comment 历史留言</h2>
      <p class="muted">
        粘贴 JSON：{"messages":[...],"replies":[...]}。字段需与 blog-comment 的
        messages / replies 表一致。
      </p>
      <textarea v-model="importText" rows="10" placeholder='{"messages":[],"replies":[],"source":"blog-comment"}' />
      <div class="row" style="margin-top: 12px;">
        <button class="primary" type="button" @click="runImport">执行导入</button>
        <span v-if="result" class="success">{{ result }}</span>
        <span v-if="error" class="error">{{ error }}</span>
      </div>
    </div>

    <div class="panel">
      <h2>输出端点</h2>
      <ul>
        <li>RSS：<code>/rss.xml</code></li>
        <li>Sitemap：<code>/sitemap.xml</code></li>
        <li>健康检查：<code>/health</code></li>
      </ul>
    </div>
  </div>
</template>
