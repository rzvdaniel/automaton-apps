<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminLayout from '../../layouts/AdminLayout.vue'
import { authed, clearSessionId, type Post } from '../../api'

const route = useRoute()
const router = useRouter()
const postId = computed(() => {
  const id = route.params.id
  return id === undefined ? null : Number(id)
})
const error = ref('')
const loading = ref(false)
const form = reactive({
  title: '',
  slug: '',
  excerpt: '',
  contentMarkdown: '',
  authorName: 'Automaton Team',
  status: 'draft'
})

onMounted(async () => {
  if (!postId.value) return
  loading.value = true
  try {
    const data = await authed<{ post: Post }>('getAdminPost', { id: postId.value })
    Object.assign(form, data.post)
  } catch {
    await router.replace('/admin/login')
  } finally {
    loading.value = false
  }
})

async function save(status = form.status) {
  error.value = ''
  try {
    const payload = { ...form, status, id: postId.value }
    const data = await authed<{ post: Post }>(postId.value ? 'updatePost' : 'createPost', payload)
    Object.assign(form, data.post)
    await router.replace(`/admin/posts/${data.post.id}`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Save failed'
  }
}

async function logout() {
  await authed('logout').catch(() => undefined)
  clearSessionId()
  await router.replace('/admin/login')
}
</script>

<template>
  <AdminLayout v-if="!loading" @logout="logout">
    <div class="toolbar">
      <h1>{{ postId ? 'Edit post' : 'New post' }}</h1>
      <div class="actions">
        <button type="button" @click="save('draft')">Save draft</button>
        <button type="button" @click="save('published')">Publish</button>
      </div>
    </div>
    <form class="editor" @submit.prevent="save()">
      <label>Title <input v-model="form.title" required /></label>
      <label>Slug <input v-model="form.slug" placeholder="generated from title if blank" /></label>
      <label>Excerpt <textarea v-model="form.excerpt" rows="3" /></label>
      <label>Content <textarea v-model="form.contentMarkdown" rows="16" required /></label>
      <label>Author <input v-model="form.authorName" /></label>
      <p v-if="error" class="notice">{{ error }}</p>
    </form>
  </AdminLayout>
</template>
