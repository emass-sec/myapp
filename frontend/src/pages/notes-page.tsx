import { useCallback, useEffect, useMemo, useState } from 'react'
import { LogOut, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, createNote, deleteNote, listNotes, updateNote } from '@/api'
import type { Note, NoteColor, NoteInput } from '@/api'
import { useAuth } from '@/auth-context'
import { Callout } from '@/components/callout'
import { Chip } from '@/components/chip'
import { ColorBadge } from '@/components/color-badge'
import { ColorFilter } from '@/components/color-filter'
import type { ColorFilterValue } from '@/components/color-filter'
import { DeleteDialog } from '@/components/delete-dialog'
import { NoteDialog } from '@/components/note-dialog'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Theme } from '@/hooks/use-theme'
import { NOTE_COLORS } from '@/lib/note-colors'

const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401

const formatStamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

interface Props {
  theme: Theme
  onToggleTheme: () => void
}

export default function NotesPage({ theme, onToggleTheme }: Props) {
  const { user, logout, clear } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Note | null>(null)
  const [deleting, setDeleting] = useState<Note | null>(null)
  const [filter, setFilter] = useState<ColorFilterValue>('all')

  const counts = useMemo(() => {
    const c = Object.fromEntries(NOTE_COLORS.map((k) => [k, 0])) as Record<NoteColor, number>
    for (const n of notes) if (n.color) c[n.color]++
    return c
  }, [notes])
  const visible = useMemo(
    () => (filter === 'all' ? notes : notes.filter((n) => n.color === filter)),
    [notes, filter],
  )

  const refresh = useCallback(async () => {
    try {
      setNotes(await listNotes())
      setError(null)
    } catch (e) {
      if (isUnauthorized(e)) return clear()
      const message = errorMessage(e, 'Failed to load notes')
      setError(message)
      toast.error(message)
    }
  }, [clear])

  useEffect(() => {
    listNotes()
      .then(setNotes)
      .catch((e: unknown) => {
        if (isUnauthorized(e)) return clear()
        const message = errorMessage(e, 'Failed to load notes')
        setError(message)
        toast.error(message)
      })
      .finally(() => setLoading(false))
  }, [clear])

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
      if (isUnauthorized(e)) return clear()
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
      if (isUnauthorized(e)) return clear()
      toast.error(errorMessage(e, 'Failed to delete note'))
      return
    }
    toast.success('Note deleted')
    await refresh()
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <NotebookPen className="size-5 text-info-fg" />
            Notes
          </h1>
          <div className="flex items-center gap-2">
            {user && <Chip className="hidden sm:inline-flex">{user.username}</Chip>}
            <Button onClick={openCreate}>
              <Plus /> New note
            </Button>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              aria-label={`Log out ${user?.username ?? ''}`}
            >
              <LogOut /> <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {error && (
          <Callout variant="danger" title="Couldn’t load your notes">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                Try again
              </Button>
            </div>
          </Callout>
        )}

        {!loading && notes.length > 0 && (
          <ColorFilter value={filter} counts={counts} total={notes.length} onChange={setFilter} />
        )}

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
          !error && (
            <Callout variant="info" title="No notes yet" className="mx-auto max-w-lg">
              <p className="text-muted-foreground">
                Create your first note to get started. It’ll show up right here.
              </p>
              <Button className="mt-3" onClick={openCreate}>
                <Plus /> Create a note
              </Button>
            </Callout>
          )
        ) : visible.length === 0 ? (
          <Callout variant="info" title="Nothing here" className="mx-auto max-w-lg">
            <p className="text-muted-foreground">No notes have this color label.</p>
            <Button className="mt-3" variant="outline" onClick={() => setFilter('all')}>
              Show all notes
            </Button>
          </Callout>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((note) => (
              <li key={note.id}>
                <Card data-color={note.color ?? undefined} className="note-card h-full gap-4">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="break-words text-lg leading-snug">{note.title}</CardTitle>
                      {note.color && <ColorBadge color={note.color} className="shrink-0" />}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {note.content}
                    </p>
                    <Chip>
                      <time dateTime={note.updated_at}>{formatStamp(note.updated_at)}</time>
                    </Chip>
                  </CardContent>
                  <CardFooter className="justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(note)}>
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger-fg hover:bg-danger-tint hover:text-danger-fg"
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
    </div>
  )
}
