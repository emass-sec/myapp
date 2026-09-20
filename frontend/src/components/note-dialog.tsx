import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ColorPicker } from '@/components/color-picker'
import type { Note, NoteColor, NoteInput } from '@/api'

interface Props {
  open: boolean
  /** The note being edited, or null when creating. */
  note: Note | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: NoteInput) => Promise<void>
}

export function NoteDialog({ open, note, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Remounted per note/open so the form state always starts fresh. */}
        <NoteForm key={note?.id ?? 'new'} note={note} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  )
}

function NoteForm({
  note,
  onCancel,
  onSubmit,
}: {
  note: Note | null
  onCancel: () => void
  onSubmit: (input: NoteInput) => Promise<void>
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [color, setColor] = useState<NoteColor | null>(note?.color ?? null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit({ title, content, color })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{note ? 'Edit note' : 'New note'}</DialogTitle>
        <DialogDescription>
          {note ? 'Update the title or content of this note.' : 'Capture something worth remembering.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="note-title">Title</Label>
        <Input
          id="note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder="Title"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="note-content">Content</Label>
        <Textarea
          id="note-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Write something…"
        />
      </div>
      <div className="grid gap-2">
        <Label>Color label</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {note ? 'Save changes' : 'Add note'}
        </Button>
      </DialogFooter>
    </form>
  )
}
