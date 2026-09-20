export type NoteColor = 'blue' | 'red' | 'amber' | 'green' | 'yellow'

export interface Note {
  id: number
  title: string
  content: string
  color: NoteColor | null
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface NoteInput {
  title: string
  content: string
  /** null clears the label on update. */
  color: NoteColor | null
  is_public: boolean
}

/** Another user's public note: read-only, with the author's username only. */
export interface SharedNote {
  id: number
  title: string
  content: string
  color: NoteColor | null
  author: string
  created_at: string
  updated_at: string
}

export interface SharedNotePage {
  items: SharedNote[]
  total: number
  limit: number
  offset: number
}

export interface User {
  id: number
  username: string
  /** UI hint only; the API enforces admin access itself. */
  is_admin: boolean
}

export type SignupMode = 'open' | 'invite' | 'closed'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')

// FastAPI errors carry either a string or a list of validation errors in `detail`.
async function errorMessage(res: Response): Promise<string> {
  try {
    const { detail } = (await res.json()) as { detail?: unknown }
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return detail[0].msg
  } catch {
    // Not JSON; fall through.
  }
  return `Request failed: ${res.status} ${res.statusText}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export interface Credentials {
  username: string
  password: string
  /** Only sent on signup, and only meaningful when signups are invite-only. */
  invite_code?: string
}

export const signup = (c: Credentials) =>
  request<User>('/auth/signup', { method: 'POST', body: JSON.stringify(c) })

export const login = (c: Credentials) =>
  request<User>('/auth/login', { method: 'POST', body: JSON.stringify(c) })

export const logout = () => request<void>('/auth/logout', { method: 'POST' })

export const getMe = () => request<User>('/auth/me')

export const getAuthConfig = () => request<{ signup_mode: SignupMode }>('/auth/config')

export type InviteStatus = 'active' | 'used_up' | 'expired' | 'revoked'

export interface Invite {
  id: number
  created_by: string | null
  created_at: string
  expires_at: string
  max_uses: number
  use_count: number
  revoked: boolean
  status: InviteStatus
}

/** The plaintext code is only present in the response to creating the invite. */
export interface CreatedInvite extends Invite {
  code: string
}

export interface AdminStats {
  users: number
  notes: number
  shared_notes: number
  signups_per_day: { date: string; count: number }[]
}

export const createInvite = (input: { max_uses: number; expires_in_days: number }) =>
  request<CreatedInvite>('/admin/invites', { method: 'POST', body: JSON.stringify(input) })

export const listInvites = () => request<Invite[]>('/admin/invites')

export const revokeInvite = (id: number) =>
  request<Invite>(`/admin/invites/${id}/revoke`, { method: 'POST' })

export const getAdminStats = () => request<AdminStats>('/admin/stats')

export const listNotes = () => request<Note[]>('/notes')

export const listSharedNotes = (limit: number, offset: number) =>
  request<SharedNotePage>(`/notes/shared?limit=${limit}&offset=${offset}`)

export const createNote = (input: NoteInput) =>
  request<Note>('/notes', { method: 'POST', body: JSON.stringify(input) })

export const updateNote = (id: number, input: NoteInput) =>
  request<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(input) })

export const deleteNote = (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' })
