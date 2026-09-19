import { useCallback, useEffect, useState } from 'react'
import { NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createNote, deleteNote, listNotes, updateNote } from '@/api'
import type { Note, NoteInput } from '@/api'
import { DeleteDialog } from '@/components/delete-dialog'
import { NoteDialog } from '@/components/note-dialog'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/sonner'
import { useTheme } from '@/hooks/use-theme'

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

export default function App() {
  const { theme, toggle } = useTheme()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Note | null>(null)
  const [deleting, setDeleting] = useState<Note | null>(null)

  const refresh = useCallback(async () => {
    try {
      setNotes(await listNotes())
      setError(null)
    } catch (e) {
      const message = errorMessage(e, 'Failed to load notes')
      setError(message)
      toast.error(message)
    }
  }, [])

  useEffect(() => {
    listNotes()
      .then(setNotes)
      .catch((e: unknown) => {
        const message = errorMessage(e, 'Failed to load notes')
        setError(message)
        toast.error(message)
      })
      .finally(() => setLoading(false))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (note: Note) => {
    setEditing(note)
    setDialogOpen(true)
  }

  const onSubmit = async (input: NoteInput) => {
    try {
      if (editing === null) {
        await createNote(input)
      } else {
        await updateNote(editing.id, input)
      }
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to save note'))
      return
    }
    toast.success(editing === null ? 'Note created' : 'Note updated')
    setDialogOpen(false)
    await refresh()
  }

  const onConfirmDelete = async (note: Note) => {
    setDeleting(null)
    try {
      await deleteNote(note.id)
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to delete note'))
      return
    }
    toast.success('Note deleted')
    await refresh()
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <NotebookPen className="size-5" />
            Notes
          </h1>
          <div className="flex items-center gap-2">
            <Button onClick={openCreate}>
              <Plus /> New note
            </Button>
            <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-2/3" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-20 text-center">
            <NotebookPen className="size-10 text-muted-foreground" />
            <h2 className="text-lg font-medium">
              {error ? 'Couldn’t load your notes' : 'No notes yet'}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {error ?? 'Create your first note to get started. It’ll show up right here.'}
            </p>
            {error ? (
              <Button variant="outline" onClick={() => void refresh()}>
                Try again
              </Button>
            ) : (
              <Button onClick={openCreate}>
                <Plus /> Create a note
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <li key={note.id}>
                <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="break-words">{note.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {note.content}
                    </p>
                  </CardContent>
                  <CardFooter className="justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(note)}>
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(note)}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>

      <NoteDialog
        open={dialogOpen}
        note={editing}
        onOpenChange={setDialogOpen}
        onSubmit={onSubmit}
      />
      <DeleteDialog
        note={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={(note) => void onConfirmDelete(note)}
      />
      <Toaster theme={theme} position="bottom-right" />
    </div>
  )
}
