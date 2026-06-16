<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { callBlog, setSessionId, type SetupStatus } from '../../api'

const router = useRouter()
const form = reactive({ siteName: 'Automaton Blog', email: '', password: '' })
const error = ref('')

onMounted(async () => {
  const status = await callBlog<SetupStatus>('setupStatus')
  if (status.hasAdmin) await router.replace('/admin/login')
})

async function submit() {
  error.value = ''
  try {
    const data = await callBlog<{ sessionId: string }>('setup', form)
    setSessionId(data.sessionId)
    await router.replace('/admin')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Setup failed'
  }
}
</script>

<template>
  <main class="auth-screen">
    <form class="auth-card" @submit.prevent="submit">
      <h1>Set up your blog</h1>
      <label>Blog title <input v-model="form.siteName" required /></label>
      <label>Admin email <input v-model="form.email" type="email" required /></label>
      <label>Admin password <input v-model="form.password" type="password" minlength="8" required /></label>
      <button type="submit">Create admin</button>
      <p v-if="error" class="notice">{{ error }}</p>
    </form>
  </main>
</template>
