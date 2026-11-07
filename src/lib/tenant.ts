import { supabase } from './supabase'

let cachedTenantId: string | null = null
let cachedForUserId: string | null = null

export function clearTenantCache() {
  cachedTenantId = null
  cachedForUserId = null
}

export async function getTenantId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  if (cachedTenantId && cachedForUserId === user.id) return cachedTenantId

  const { data, error } = await supabase.rpc('current_owner_id')
  if (error) throw error

  const tenantId = typeof data === 'string' && data.length > 0 ? data : user.id

  cachedTenantId = tenantId
  cachedForUserId = user.id

  return tenantId
}
