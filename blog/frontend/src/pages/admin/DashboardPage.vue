<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AdminLayout from '../../layouts/AdminLayout.vue'
import { authed, callBlog, clearSessionId, type Post } from '../../api'

const router = useRouter()
const posts = ref<Post[]>([])
const error = ref('')

async function load() {
  try {
    const data = await authed<{ posts: Post[] }>('listAdminPosts')
    posts.value = data.posts
  } catch (err) {
    const status = await callBlog<{ hasAdmin: boolean }>('setupStatus')
    await router.replace(status.hasAdmin ? '/admin/login' : '/setup')
  }
}

async function removePost(id: number) {
  await authed('deletePost', { id })
  await load()
}

async function logout() {
  await authed('logout').catch(() => undefined)
  clearSessionId()
  await router.replace('/admin/login')
}

onMounted(load)
</script>

<template>
  <AdminLayout @logout="logout">
    <div class="toolbar">
      <h1>Posts</h1>
      <RouterLink class="button" to="/admin/posts/new">New post</RouterLink>
    </div>
    <p v-if="error" class="notice">{{ error }}</p>
    <table>
      <thead><tr><th>Title</th><th>Status</th><th>Updated</th><th></th></tr></thead>
      <tbody>
        <tr v-for="post in posts" :key="post.id">
          <td><RouterLink :to="`/admin/posts/${post.id}`">{{ post.title }}</RouterLink></td>
          <td>{{ post.status }}</td>
          <td>{{ post.updatedAt }}</td>
          <td><button type="button" @click="removePost(post.id)">Delete</button></td>
        </tr>
      </tbody>
    </table>
  </AdminLayout>
</template>
