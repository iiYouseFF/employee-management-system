import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { AuditLogEntry, AuditLogFilters } from '../types/auditLogs'

export function useAuditLogs(filters: AuditLogFilters = {}) {
  const { isManager, user } = useAuth()

  return useQuery({
    queryKey: ['audit_logs', filters, user?.id],
    queryFn: async (): Promise<AuditLogEntry[]> => {
      if (!isManager) return []

      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (filters.table_name && filters.table_name !== 'all') {
        query = query.eq('table_name', filters.table_name)
      }

      if (filters.action && filters.action !== 'all') {
        query = query.eq('action', filters.action)
      }

      if (filters.startDate) {
        query = query.gte('created_at', `${filters.startDate}T00:00:00`)
      }

      if (filters.endDate) {
        query = query.lte('created_at', `${filters.endDate}T23:59:59`)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching audit logs:', error)
        throw error
      }

      let entries = (data || []) as AuditLogEntry[]

      // Client-side search for query text across description, actor_name, actor_email, record_id
      if (filters.search && filters.search.trim()) {
        const s = filters.search.trim().toLowerCase()
        entries = entries.filter((item) => {
          return (
            (item.description && item.description.toLowerCase().includes(s)) ||
            (item.actor_name && item.actor_name.toLowerCase().includes(s)) ||
            (item.actor_email && item.actor_email.toLowerCase().includes(s)) ||
            (item.record_id && item.record_id.toLowerCase().includes(s)) ||
            (item.table_name && item.table_name.toLowerCase().includes(s))
          )
        })
      }

      return entries
    },
    enabled: Boolean(isManager),
    staleTime: 1000 * 15, // 15 seconds
  })
}

