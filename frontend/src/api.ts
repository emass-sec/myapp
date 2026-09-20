export interface Note {
  id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface NoteInput {
  title: string
  content: string
}

export interface User {
  id: number
  username: string
}

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
}

export const signup = (c: Credentials) =>
  request<User>('/auth/signup', { method: 'POST', body: JSON.stringify(c) })

export const login = (c: Credentials) =>
  request<User>('/auth/login', { method: 'POST', body: JSON.stringify(c) })

export const logout = () => request<void>('/auth/logout', { method: 'POST' })

export const getMe = () => request<User>('/auth/me')

export const listNotes = () => request<Note[]>('/notes')

export const createNote = (input: NoteInput) =>
  request<Note>('/notes', { method: 'POST', body: JSON.stringify(input) })

export const updateNote = (id: number, input: NoteInput) =>
  request<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(input) })

export const deleteNote = (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' })
