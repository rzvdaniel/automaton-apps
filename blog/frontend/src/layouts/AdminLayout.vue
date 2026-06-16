<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <RouterLink class="brand" to="/">Automaton Blog</RouterLink>
      <RouterLink to="/admin">Posts</RouterLink>
      <RouterLink to="/admin/posts/new">New post</RouterLink>
      <button type="button" @click="$emit('logout')">Log out</button>
    </aside>
    <main class="admin-main">
      <slot />
    </main>
  </div>
</template>
