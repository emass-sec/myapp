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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const listNotes = () => request<Note[]>('/notes')

export const createNote = (input: NoteInput) =>
  request<Note>('/notes', { method: 'POST', body: JSON.stringify(input) })

export const updateNote = (id: number, input: NoteInput) =>
  request<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(input) })

export const deleteNote = (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' })
