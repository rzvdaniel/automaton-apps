export type Post = {
  id: number
  slug: string
  title: string
  excerpt: string
  contentMarkdown: string
  status: 'draft' | 'published'
  authorName: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type SetupStatus = { hasAdmin: boolean; siteName: string; tagline: string }

const SESSION_KEY = 'automaton_blog_session'

export function getSessionId() {
  return sessionStorage.getItem(SESSION_KEY) || ''
}

export function setSessionId(sessionId: string) {
  sessionStorage.setItem(SESSION_KEY, sessionId)
}

export function clearSessionId() {
  sessionStorage.removeItem(SESSION_KEY)
}

export async function callBlog<T>(action: string, inputs: Record<string, unknown> = {}): Promise<T> {
  const routes: Record<string, [string, string]> = {
    setupStatus: ['GET', '/api/setup/status'], setup: ['POST', '/api/setup'], login: ['POST', '/api/auth/login'], logout: ['POST', '/api/auth/logout'],
    listPublishedPosts: ['GET', '/api/posts'], getPublishedPost: ['GET', `/api/posts/${encodeURIComponent(String(inputs.slug || ''))}`],
    listAdminPosts: ['GET', '/api/admin/posts'], getAdminPost: ['GET', `/api/admin/posts/${inputs.id}`], createPost: ['POST', '/api/admin/posts'], updatePost: ['PUT', `/api/admin/posts/${inputs.id}`], deletePost: ['DELETE', `/api/admin/posts/${inputs.id}`]
  }
  const [method, url] = routes[action] || ['', '']
  if (!url) throw new Error(`Unknown API operation: ${action}`)
  const response = await fetch(url, { method, credentials: 'include', headers: method === 'GET' ? { 'X-Session-ID': getSessionId() } : { 'Content-Type': 'application/json', 'X-Session-ID': getSessionId() }, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(inputs) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail || 'Request failed')
  return body as T
}

export async function authed<T>(action: string, inputs: Record<string, unknown> = {}) {
  return callBlog<T>(action, { ...inputs, sessionId: getSessionId() })
}
