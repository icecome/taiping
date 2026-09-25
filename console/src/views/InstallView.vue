<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const done = ref(false)
const router = useRouter()

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await api.setup(name.value, email.value, password.value)
    done.value = true
    await api.login(name.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '初始化失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="panel" style="max-width: 480px; margin: 10vh auto;">
    <h1>安装向导</h1>
    <p class="muted">创建太平博客的管理员账号</p>
    <form @submit.prevent="submit">
      <div class="field">
        <label>用户名</label>
        <input v-model="name" required autocomplete="username" />
      </div>
      <div class="field">
        <label>邮箱</label>
        <input v-model="email" type="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label>密码</label>
        <input v-model="password" type="password" required minlength="6" autocomplete="new-password" />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="done" class="success">初始化成功，正在进入控制台…</p>
      <button type="submit" :disabled="loading">{{ loading ? '提交中…' : '创建并登录' }}</button>
    </form>
  </div>
</template>
