import { useSyncExternalStore } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { clearTenantCache } from '@/shared/lib/tenant'
import { normalizeRepPermissions, type RepPermissionKey } from '@/features/reps/repPermissions'
import type { User } from '@supabase/supabase-js'

export type AppRole = 'manager' | 'sales_rep'

export interface RepProfile {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  owner_id: string
  permissions: ReturnType<typeof normalizeRepPermissions>
}

interface AuthState {
  user: User | null
  role: AppRole | null
  repProfile: RepProfile | null
  loading: boolean
}

const initialState: AuthState = {
  user: null,
  role: null,
  repProfile: null,
  loading: true,
}

let state: AuthState = initialState
let resolution = 0
let started = false

const listeners = new Set<() => void>()

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  ensureStarted()
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return state
}

function clearState() {
  resolution += 1
  clearTenantCache()
  setState({ user: null, role: null, repProfile: null, loading: false })
}

async function resolveProfile(currentUser: User | null, showLoading = true) {
  const token = ++resolution

  if (!currentUser) {
    clearState()
    return
  }

  // Only set loading: true if we don't already have a valid user loaded,
  // preventing screen unmount/flicker when returning to the window/tab.
  if (showLoading && !state.user) {
    setState({ user: currentUser, loading: true })
  } else {
    setState({ user: currentUser })
  }

  let nextRole: AppRole | null = null
  let nextRepProfile: RepProfile | null = null

  try {
    const { data, error } = await supabase.rpc('current_role_name')
    if (!error && (data === 'manager' || data === 'sales_rep')) {
      nextRole = data
    }

    if (nextRole === 'sales_rep') {
      const { data: rep, error: repError } = await supabase
        .from('reps')
        .select('id, name, email, phone, owner_id, permissions')
        .eq('user_id', currentUser.id)
        .maybeSingle()

      if (!repError && rep) {
        nextRepProfile = {
          ...(rep as Omit<RepProfile, 'permissions'>),
          permissions: normalizeRepPermissions(rep.permissions),
        }
      }
    }
  } catch {
    nextRole = null
    nextRepProfile = null
  }

  if (token !== resolution) return

  setState({
    user: currentUser,
    role: nextRole,
    repProfile: nextRepProfile,
    loading: false,
  })
}

function ensureStarted() {
  if (started) return
  started = true

  void supabase.auth.getSession().then(({ data: { session } }) => {
    void resolveProfile(session?.user ?? null)
  })

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return
    if (event === 'SIGNED_OUT') {
      clearState()
      return
    }
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
      void resolveProfile(session?.user ?? null)
    }
  })

  // Manager-set rep permissions take effect on the next visit to the tab.
  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') void refreshProfile()
  }
  window.addEventListener('focus', refreshWhenVisible)
  document.addEventListener('visibilitychange', refreshWhenVisible)
}

async function refreshProfile() {
  await resolveProfile(state.user, false)
}

async function signOut() {
  clearState()
  await supabase.auth.signOut()
}

export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const isRep = snapshot.role === 'sales_rep'
  const isManager = snapshot.role === 'manager'
  const isReadOnly = isRep
  const hasRole = (required: AppRole) => snapshot.role === required
  const can = (key: RepPermissionKey): boolean =>
    isManager || (isRep && snapshot.repProfile?.permissions[key] === true)

  return {
    user: snapshot.user,
    role: snapshot.role,
    repProfile: snapshot.repProfile,
    hasRole,
    can,
    isRep,
    isReadOnly,
    isManager,
    signOut,
    refresh: refreshProfile,
    loading: snapshot.loading,
  }
}
