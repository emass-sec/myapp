import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Note } from '@/api'

interface Props {
  note: Note | null
  onCancel: () => void
  onConfirm: (note: Note) => void
}

export function DeleteDialog({ note, onCancel, onConfirm }: Props) {
  return (
    <AlertDialog open={note !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="border-danger bg-danger-tint">
        <AlertDialogHeader>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-danger-fg">
            Danger
          </p>
          <AlertDialogTitle>Delete this note?</AlertDialogTitle>
          <AlertDialogDescription className="text-foreground/80">
            “{note?.title}” will be permanently deleted. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30"
            onClick={() => note && onConfirm(note)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
