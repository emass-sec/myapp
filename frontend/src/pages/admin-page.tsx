import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, Copy, KeyRound, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { createInvite, getAdminStats, listInvites, revokeInvite } from '@/api'
import type { AdminStats, CreatedInvite, Invite, InviteStatus } from '@/api'
import { Callout } from '@/components/callout'
import { Chip } from '@/components/chip'
import { ThemeToggle } from '@/components/theme-toggle'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { Theme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

const STATUS_STYLES: Record<InviteStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'border-success text-success-fg' },
  used_up: { label: 'Used up', cls: 'border-info text-info-fg' },
  expired: { label: 'Expired', cls: 'border-warning text-warning-fg' },
  revoked: { label: 'Revoked', cls: 'border-danger text-danger-fg' },
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error('Couldn’t copy. Select the text and copy it manually.')
  }
}

interface Props {
  theme: Theme
  onToggleTheme: () => void
}

export default function AdminPage({ theme, onToggleTheme }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const [revoking, setRevoking] = useState<Invite | null>(null)

  const reload = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([getAdminStats(), listInvites()])
      setStats(s)
      setInvites(i)
      setError(null)
    } catch (e) {
      setError(errorMessage(e, 'Failed to load admin data'))
    }
  }, [])

  useEffect(() => {
    Promise.all([getAdminStats(), listInvites()])
      .then(([s, i]) => {
        setStats(s)
        setInvites(i)
      })
      .catch((e: unknown) => setError(errorMessage(e, 'Failed to load admin data')))
  }, [])

  const onConfirmRevoke = async (invite: Invite) => {
    setRevoking(null)
    try {
      await revokeInvite(invite.id)
      toast.success('Invite revoked')
      await reload()
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to revoke invite'))
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheck className="size-5 text-info-fg" />
            Admin
          </h1>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft /> Back to notes
              </Link>
            </Button>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {error && (
          <Callout variant="danger" title="Error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => void reload()}>
                Try again
              </Button>
            </div>
          </Callout>
        )}

        <StatsSection stats={stats} />

        <section aria-labelledby="invites-heading" className="space-y-4">
          <h2
            id="invites-heading"
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-info-fg"
          >
            <KeyRound className="size-4" aria-hidden /> Invite codes
          </h2>
          <CreateInviteForm
            onCreated={(invite) => {
              setCreated(invite)
              void reload()
            }}
          />
          {created && <CreatedCallout invite={created} onDismiss={() => setCreated(null)} />}
          <InvitesTable invites={invites} onRevoke={setRevoking} />
        </section>
      </main>

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent className="border-danger bg-danger-tint">
          <AlertDialogHeader>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-danger-fg">
              Danger
            </p>
            <AlertDialogTitle>Revoke invite #{revoking?.id}?</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80">
              The code stops working immediately. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30"
              onClick={() => revoking && void onConfirmRevoke(revoking)}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatsSection({ stats }: { stats: AdminStats | null }) {
  const tiles = [
    { label: 'Users', value: stats?.users },
    { label: 'Notes', value: stats?.notes },
    { label: 'Shared notes', value: stats?.shared_notes },
  ]
  return (
    <section aria-labelledby="stats-heading" className="space-y-4">
      <h2
        id="stats-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-info-fg"
      >
        Overview
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="gap-1">
            <CardHeader>
              <CardDescription>{t.label}</CardDescription>
            </CardHeader>
            <CardContent>
              {t.value === undefined ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <p className="font-mono text-3xl font-semibold">{t.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signups per day</CardTitle>
          <CardDescription>Last 30 days (UTC)</CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? <SignupsChart series={stats.signups_per_day} /> : <Skeleton className="h-32 w-full" />}
        </CardContent>
      </Card>
    </section>
  )
}

function SignupsChart({ series }: { series: AdminStats['signups_per_day'] }) {
  const max = Math.max(1, ...series.map((d) => d.count))
  const total = series.reduce((n, d) => n + d.count, 0)
  return (
    <div>
      <div
        role="img"
        aria-label={`Signups per day for the last ${series.length} days: ${total} in total, up to ${max} in one day`}
        className="flex h-32 items-end gap-1"
      >
        {series.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className={cn(
              'flex-1 rounded-t-sm transition-colors',
              d.count > 0 ? 'bg-info hover:bg-info/80' : 'bg-border',
            )}
            style={{ height: d.count > 0 ? `${(d.count / max) * 100}%` : '2px' }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Chip>{series[0]?.date}</Chip>
        <Chip>
          {total} total · max {max}/day
        </Chip>
        <Chip>{series[series.length - 1]?.date}</Chip>
      </div>
    </div>
  )
}

function CreateInviteForm({ onCreated }: { onCreated: (invite: CreatedInvite) => void }) {
  const [maxUses, setMaxUses] = useState('1')
  const [days, setDays] = useState('7')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      onCreated(await createInvite({ max_uses: Number(maxUses), expires_in_days: Number(days) }))
    } catch (err) {
      setError(errorMessage(err, 'Failed to create invite'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create an invite</CardTitle>
        <CardDescription>Defaults: one use, valid for 7 days.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="max-uses">Max uses (1–100)</Label>
            <Input
              id="max-uses"
              type="number"
              min={1}
              max={100}
              required
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="w-32 font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="expires-days">Expires in days (1–90)</Label>
            <Input
              id="expires-days"
              type="number"
              min={1}
              max={90}
              required
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-32 font-mono"
            />
          </div>
          <Button type="submit" disabled={submitting}>
            <KeyRound /> Create invite
          </Button>
        </form>
        {error && (
          <Callout variant="danger" title="Error" className="mt-4">
            {error}
          </Callout>
        )}
      </CardContent>
    </Card>
  )
}

function CreatedCallout({ invite, onDismiss }: { invite: CreatedInvite; onDismiss: () => void }) {
  // origin is https://app.masnetsec.com in production.
  const link = `${window.location.origin}/signup?invite=${invite.code}`
  return (
    <Callout variant="warning" title="Save this code now. It won’t be shown again">
      <div className="mt-2 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-warning bg-background px-3 py-1.5 font-mono text-xl font-semibold tracking-widest">
            {invite.code}
          </span>
          <Button variant="outline" size="sm" onClick={() => void copy(invite.code, 'Code')}>
            <Copy /> Copy code
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button variant="outline" size="sm" onClick={() => void copy(link, 'Link')}>
            <Copy /> Copy link
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {invite.max_uses} {invite.max_uses === 1 ? 'use' : 'uses'}, expires{' '}
          {formatDate(invite.expires_at)}.
        </p>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          I’ve saved it
        </Button>
      </div>
    </Callout>
  )
}

function InvitesTable({
  invites,
  onRevoke,
}: {
  invites: Invite[] | null
  onRevoke: (invite: Invite) => void
}) {
  if (invites === null) return <Skeleton className="h-32 w-full" />
  if (invites.length === 0) {
    return (
      <Callout variant="info" title="No invites yet">
        Create one above and share the link.
      </Callout>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Invite codes</caption>
        <thead className="bg-raised text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Invite</th>
            <th scope="col" className="px-4 py-2 font-medium">Status</th>
            <th scope="col" className="px-4 py-2 font-medium">Uses</th>
            <th scope="col" className="px-4 py-2 font-medium">Expires</th>
            <th scope="col" className="px-4 py-2 font-medium">Created by</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {invites.map((i) => {
            const st = STATUS_STYLES[i.status]
            return (
              <tr key={i.id} className="bg-card">
                <td className="px-4 py-2">
                  <Chip>#{i.id}</Chip>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      st.cls,
                    )}
                  >
                    {st.label}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono">
                  {i.use_count}/{i.max_uses}
                </td>
                <td className="px-4 py-2">
                  <Chip>{formatDate(i.expires_at)}</Chip>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{i.created_by ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  {i.status === 'active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger-fg hover:bg-danger-tint hover:text-danger-fg"
                      onClick={() => onRevoke(i)}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
