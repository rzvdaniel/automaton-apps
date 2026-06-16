<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BlogLayout from '../layouts/BlogLayout.vue'
import { callBlog, type Post } from '../api'

const route = useRoute()
const post = ref<Post | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    const data = await callBlog<{ post: Post }>('getPublishedPost', { slug: route.params.slug })
    post.value = data.post
    document.title = `${data.post.title} - Automaton Blog`
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Post not found'
  }
})
</script>

<template>
  <BlogLayout>
    <p v-if="error" class="notice">{{ error }}</p>
    <article v-else-if="post" class="article">
      <p class="status">{{ post.publishedAt || post.createdAt }}</p>
      <h1>{{ post.title }}</h1>
      <p class="excerpt">{{ post.excerpt }}</p>
      <div class="markdown">{{ post.contentMarkdown }}</div>
    </article>
  </BlogLayout>
</template>
