import { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { ApiError, listSharedNotes } from '@/api'
import type { SharedNote } from '@/api'
import { Callout } from '@/components/callout'
import { Chip } from '@/components/chip'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const PAGE_SIZE = 12

const formatStamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

interface Props {
  /** Called when the API says the session is gone. */
  onUnauthorized: () => void
}

/** Read-only feed of other users' public notes. Has no edit or delete controls by design. */
export function SharedNotesSection({ onUnauthorized }: Props) {
  const [items, setItems] = useState<SharedNote[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized()
      setError(e instanceof Error ? e.message : 'Failed to load shared notes')
    },
    [onUnauthorized],
  )

  const loadFirstPage = useCallback(
    () =>
      listSharedNotes(PAGE_SIZE, 0)
        .then((page) => {
          setItems(page.items)
          setTotal(page.total)
          setError(null)
        })
        .catch(handleError),
    [handleError],
  )

  useEffect(() => {
    void loadFirstPage().finally(() => setLoading(false))
  }, [loadFirstPage])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const page = await listSharedNotes(PAGE_SIZE, items.length)
      setItems((prev) => [...prev, ...page.items])
      setTotal(page.total)
      setError(null)
    } catch (e) {
      handleError(e)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section
      aria-labelledby="shared-heading"
      className="space-y-4 rounded-xl border border-info bg-info-tint/40 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="shared-heading"
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-info-fg"
        >
          <Users className="size-4" aria-hidden />
          Shared with everyone
        </h2>
        {!loading && !error && <Chip>{total}</Chip>}
      </div>

      {error && (
        <Callout variant="danger" title="Couldn’t load shared notes">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void (items.length === 0 ? loadFirstPage() : loadMore())}
            >
              Try again
            </Button>
          </div>
        </Callout>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
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
      ) : items.length === 0 ? (
        !error && (
          <p className="text-sm text-foreground">
            Nobody has shared a note yet. Turn on “Share with all users” on one of yours to start.
          </p>
        )
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((note) => (
              <li key={note.id}>
                <Card data-color="blue" className="note-card h-full gap-4">
                  <CardHeader>
                    <CardTitle className="break-words text-lg leading-snug">{note.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {note.content}
                    </p>
                  </CardContent>
                  <CardFooter className="flex-wrap gap-2">
                    <Chip>by {note.author}</Chip>
                    <Chip>
                      <time dateTime={note.created_at}>{formatStamp(note.created_at)}</time>
                    </Chip>
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>
          {items.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
