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

const TOKEN_KEY = 'automaton_blog_session'

export function getSessionToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setSessionToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearSessionToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function callBlog<T>(action: string, inputs: Record<string, unknown> = {}): Promise<T> {
  if (!window.automatonApi) {
    throw new Error('Automaton backend is not available in this preview. Deploy or run with an Automaton runner.')
  }
  return window.automatonApi.callController('blog', action, inputs) as Promise<T>
}

export async function authed<T>(action: string, inputs: Record<string, unknown> = {}) {
  return callBlog<T>(action, { ...inputs, sessionToken: getSessionToken() })
}
