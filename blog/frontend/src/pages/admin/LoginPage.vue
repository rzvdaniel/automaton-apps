<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { callBlog, setSessionToken } from '../../api'

const router = useRouter()
const form = reactive({ email: '', password: '' })
const error = ref('')

async function submit() {
  error.value = ''
  try {
    const data = await callBlog<{ sessionToken: string }>('login', form)
    setSessionToken(data.sessionToken)
    await router.replace('/admin')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Login failed'
  }
}
</script>

<template>
  <main class="auth-screen">
    <form class="auth-card" @submit.prevent="submit">
      <h1>Admin login</h1>
      <label>Email <input v-model="form.email" type="email" required /></label>
      <label>Password <input v-model="form.password" type="password" required /></label>
      <button type="submit">Log in</button>
      <p v-if="error" class="notice">{{ error }}</p>
    </form>
  </main>
</template>
