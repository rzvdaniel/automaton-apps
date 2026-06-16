<template>
  <div class="site-shell">
    <header class="site-header">
      <RouterLink class="brand" to="/">Automaton Blog</RouterLink>
      <nav>
        <RouterLink to="/">Articles</RouterLink>
        <RouterLink to="/admin">Admin</RouterLink>
      </nav>
    </header>
    <main class="site-main">
      <slot />
    </main>
    <footer class="site-footer">Built and hosted on Automaton.</footer>
  </div>
</template>
