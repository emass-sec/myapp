import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createNote, deleteNote, listNotes, updateNote } from './api'
import type { Note } from './api'

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const refresh = useCallback(async () => {
    try {
      setNotes(await listNotes())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes')
    }
  }, [])

  useEffect(() => {
    listNotes()
      .then(setNotes)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load notes'))
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setContent('')
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if (editingId === null) {
        await createNote({ title, content })
      } else {
        await updateNote(editingId, { title, content })
      }
      resetForm()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
    }
  }

  const onEdit = (note: Note) => {
    setEditingId(note.id)
    setTitle(note.title)
    setContent(note.content)
  }

  const onDelete = async (id: number) => {
    try {
      await deleteNote(id)
      if (editingId === id) resetForm()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note')
    }
  }

  return (
    <main className="app">
      <h1>Notes</h1>
      {error && <p className="error">{error}</p>}

      <form onSubmit={onSubmit}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
        <textarea
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
        />
        <div className="actions">
          <button type="submit">{editingId === null ? 'Add note' : 'Save changes'}</button>
          {editingId !== null && (
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul className="notes">
        {notes.map((note) => (
          <li key={note.id}>
            <h2>{note.title}</h2>
            <p>{note.content}</p>
            <div className="actions">
              <button onClick={() => onEdit(note)}>Edit</button>
              <button onClick={() => void onDelete(note.id)}>Delete</button>
            </div>
          </li>
        ))}
        {notes.length === 0 && !error && <li className="empty">No notes yet.</li>}
      </ul>
    </main>
  )
}
