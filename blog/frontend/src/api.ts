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
  if (!window.automatonApi) {
    console.error('[blog api] Automaton backend is unavailable', { action })
    throw new Error('Automaton backend is not available in this preview. Deploy or run with an Automaton runner.')
  }
  console.log('[blog api] calling action', { action })
  try {
    const result = await window.automatonApi.callController('blog', action, inputs) as T
    console.log('[blog api] action succeeded', { action })
    return result
  } catch (error) {
    console.error('[blog api] action failed', { action, error })
    throw error
  }
}

export async function authed<T>(action: string, inputs: Record<string, unknown> = {}) {
  return callBlog<T>(action, { ...inputs, sessionId: getSessionId() })
}
