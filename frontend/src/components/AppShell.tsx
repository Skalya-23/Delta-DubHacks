import { Activity, Clock, Flag, LayoutGrid, LogOut, Menu, MessageCircleQuestion, Monitor, Moon, NotebookPen, PanelLeftClose, PanelLeftOpen, Settings, Sun, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/useAuth'
import { useMyProfile, useProfiles } from '@/hooks/useProfiles'
import { useAllMyCommits, useMyProjects, useProjectBySlug } from '@/hooks/useProject'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { DeltaIcon, DeltaLogo } from './DeltaLogo'
import { InviteDialog } from './InviteDialog'
import { UserAvatar } from './UserAvatar'

const COLLAPSE_KEY = 'delta-sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()

  // Close the mobile drawer on navigation.
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setDrawer(false)
  }

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      // storage unavailable
    }
  }, [collapsed])

  return (
    <div className="min-h-svh md:flex">
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-svh shrink-0 border-r border-border bg-card/60 backdrop-blur transition-[width] duration-200 md:block',
          collapsed ? 'w-[72px]' : 'w-[240px]',
        )}
        aria-label="Main navigation"
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </aside>

      {/* Phone: top bar + drawer */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
        <Link to="/" aria-label="Delta home">
          <DeltaLogo size="sm" />
        </Link>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className="flex size-10 items-center justify-center rounded-full hover:bg-subtle"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} aria-label="Close menu" />
          <aside className="rise absolute inset-y-0 left-0 w-[280px] border-r border-border bg-card shadow-xl">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full hover:bg-subtle"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <SidebarContent collapsed={false} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const { user } = useAuth()
  const match = useMatch('/:owner/:slug/*')
  // /join/:token looks like /:owner/:slug but isn't a project.
  const inProject = Boolean(match && match.params.owner !== 'join')
  const owner = inProject ? match?.params.owner : undefined
  const slug = inProject ? match?.params.slug : undefined
  const project = useProjectBySlug(owner, slug)
  const base = owner && slug ? `/${owner}/${slug}` : null
  const name = project.data?.name ?? slug
  const projects = useMyProjects()
  const sharedCount = (projects.data ?? []).filter((p) => p.owner_id !== user?.id).length

  return (
    <div className="flex h-full flex-col px-3 py-4">
      <div className={cn('mb-6 flex items-center', collapsed ? 'justify-center' : 'justify-between pl-2')}>
        <Link to="/" aria-label="Delta home" className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring">
          {collapsed ? <DeltaIcon size={28} /> : <DeltaLogo size="sm" />}
        </Link>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Home">
        <Item to="/" end icon={LayoutGrid} label="Your projects" collapsed={collapsed} />
        <Item to="/shared" icon={Users} label="Shared with you" collapsed={collapsed} badge={sharedCount || undefined} />
        <Item to="/feed" icon={Activity} label="Feed" collapsed={collapsed} />
      </nav>

      {base && (
        <nav className="mt-6 flex flex-col gap-1" aria-label="This project">
          {!collapsed && (
            <div className="mb-1 truncate px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase" title={name}>
              {name}
            </div>
          )}
          {collapsed && <div className="mx-auto mb-2 h-px w-8 bg-border" aria-hidden />}
          <Item to={base} end icon={Clock} label="Timeline" collapsed={collapsed} alsoActive={[`${base}/change/`, `${base}/compare`, `${base}/go-back/`]} />
          <Item to={`${base}/checkpoints`} icon={Flag} label="Checkpoints" collapsed={collapsed} />
          <Item to={`${base}/notes`} icon={NotebookPen} label="Documentation" collapsed={collapsed} />
          <Item to={`${base}/ask`} icon={MessageCircleQuestion} label="Ask AI" collapsed={collapsed} />
          {project.data && (
            <InviteDialog
              project={project.data}
              trigger={
                <button
                  type="button"
                  title={collapsed ? 'Invite people' : undefined}
                  aria-label={collapsed ? 'Invite people' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-full px-3 text-[15px] font-medium text-brand-text transition-colors hover:bg-brand-soft',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <UserPlus className="size-5 shrink-0" aria-hidden />
                  {!collapsed && 'Invite people'}
                </button>
              }
            />
          )}
        </nav>
      )}

      {!base && !collapsed && <RecentProjects />}

      <div className="mt-auto flex flex-col gap-1">
        {base && <Item to={`${base}/settings`} icon={Settings} label="Project settings" collapsed={collapsed} />}
        <ThemeToggle collapsed={collapsed} />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'flex h-10 items-center gap-3 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            {!collapsed && 'Collapse'}
          </button>
        )}
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  )
}

function Item({
  to,
  icon: Icon,
  label,
  collapsed,
  end,
  alsoActive = [],
  badge,
}: {
  to: string
  icon: typeof Clock
  label: string
  collapsed: boolean
  end?: boolean
  alsoActive?: string[]
  badge?: number
}) {
  const { pathname } = useLocation()
  const extra = alsoActive.some((p) => pathname.startsWith(p))
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex h-10 items-center gap-3 rounded-full px-3 text-[15px] font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive || extra ? 'bg-brand-soft text-brand-text' : 'text-muted-foreground hover:bg-subtle hover:text-foreground',
        )
      }
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge !== undefined && (
        <span className="ml-auto rounded-full bg-subtle px-2 font-mono text-xs text-muted-foreground" aria-label={`${badge} projects`}>
          {badge}
        </span>
      )}
      {collapsed && badge !== undefined && <span className="absolute top-1.5 right-3 size-2 rounded-full bg-brand" aria-hidden />}
    </NavLink>
  )
}

/** Quick links to your most recently active projects (shown on the home pages). */
function RecentProjects() {
  const projects = useMyProjects()
  const commits = useAllMyCommits()
  const profiles = useProfiles()
  const last: Record<string, string> = {}
  for (const c of commits.data ?? []) if (!last[c.project_id]) last[c.project_id] = c.captured_at
  const list = [...(projects.data ?? [])]
    .sort((a, b) => (last[b.id] ?? b.created_at).localeCompare(last[a.id] ?? a.created_at))
    .slice(0, 6)
  if (list.length === 0) return null
  return (
    <nav className="mt-6 flex min-h-0 flex-col gap-0.5 overflow-y-auto" aria-label="Recent projects">
      <div className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent projects</div>
      {list.map((p) => {
        const owner = profiles.data?.[p.owner_id]?.username
        return (
          <NavLink
            key={p.id}
            to={`/${owner ?? '…'}/${p.slug}`}
            className="flex h-9 items-center gap-2.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-soft font-heading text-[11px] font-semibold text-brand-text" aria-hidden>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{p.name}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { resolved, setTheme } = useTheme()
  const dark = resolved === 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={cn(
        'flex h-10 items-center gap-3 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground',
        collapsed && 'justify-center px-0',
      )}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      {!collapsed && (dark ? 'Light mode' : 'Dark mode')}
    </button>
  )
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth()
  const profile = useMyProfile()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'mt-1 flex items-center gap-3 rounded-full p-1.5 text-left transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center',
          )}
          aria-label="Your account"
        >
          <UserAvatar profile={profile} size={30} />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{profile?.display_name ?? profile?.username ?? '…'}</span>
              <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          Signed in as <span className="font-semibold">{profile?.username ?? user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> Match my computer
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await supabase.auth.signOut()
            navigate('/login')
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
