import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './styles.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./pages/HomePage.vue') },
    { path: '/post/:slug', component: () => import('./pages/ArticlePage.vue') },
    { path: '/setup', component: () => import('./pages/admin/SetupPage.vue') },
    { path: '/admin/login', component: () => import('./pages/admin/LoginPage.vue') },
    { path: '/admin', component: () => import('./pages/admin/DashboardPage.vue') },
    { path: '/admin/posts/new', component: () => import('./pages/admin/PostEditorPage.vue') },
    { path: '/admin/posts/:id', component: () => import('./pages/admin/PostEditorPage.vue') }
  ]
})

createApp(App).use(router).mount('#app')
