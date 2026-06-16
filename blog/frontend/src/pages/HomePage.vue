<script setup lang="ts">
import { onMounted, ref } from 'vue'
import BlogLayout from '../layouts/BlogLayout.vue'
import { callBlog, type Post } from '../api'

const posts = ref<Post[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const data = await callBlog<{ posts: Post[] }>('listPublishedPosts')
    posts.value = data.posts
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to load posts'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <BlogLayout>
    <section class="hero">
      <p>The blog you are reading is built and hosted on Automaton.</p>
      <h1>Automaton Blog</h1>
    </section>
    <p v-if="loading">Loading articles...</p>
    <p v-else-if="error" class="notice">{{ error }}</p>
    <section v-else class="post-grid">
      <article v-for="post in posts" :key="post.id" class="post-card">
        <p class="status">{{ post.publishedAt || post.createdAt }}</p>
        <h2><RouterLink :to="`/post/${post.slug}`">{{ post.title }}</RouterLink></h2>
        <p>{{ post.excerpt }}</p>
      </article>
      <p v-if="posts.length === 0" class="notice">No published posts yet.</p>
    </section>
  </BlogLayout>
</template>
