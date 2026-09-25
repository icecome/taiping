<script setup lang="ts">
import { ref } from 'vue'
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>页面</h1>
        <p class="page-desc">独立页面管理（与文章共用内容模型）</p>
      </div>
      <RouterLink class="btn primary" to="/posts/new?type=page">新建页面</RouterLink>
    </div>
    <div class="panel">
      <div class="empty">
        页面与文章共用同一内容管线。可在撰写页通过 slug/模板扩展为独立页面路由。
      </div>
    </div>
  </div>
</template>
