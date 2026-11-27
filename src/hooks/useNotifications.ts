import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/supabase'

export type NotificationRow = Database['public']['Tables']['notifications']['Row']

export interface OperationalAlert {
  alert_key: string
  category: string
  severity: string
  title: string
  message: string
  target_tab: string
  target_id: string | null
  count: number
}

const ALERTS_KEY = ['operational-alerts'] as const
const NOTIFICATIONS_KEY = ['notifications'] as const

async function fetchOperationalAlerts(): Promise<OperationalAlert[]> {
  const { data, error } = await supabase.rpc('get_operational_alerts')
  if (error) throw error
  return (data ?? []) as OperationalAlert[]
}

async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as NotificationRow[]
}

/** Live operational alerts + notification log, refreshed every 15s, with read-state mutation. */
export function useNotifications() {
  const queryClient = useQueryClient()

  const alertsQuery = useQuery({
    queryKey: ALERTS_KEY,
    queryFn: fetchOperationalAlerts,
    refetchInterval: 15_000,
  })

  const notificationsQuery = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: fetchNotifications,
    refetchInterval: 15_000,
  })

  const markReadMutation = useMutation({
    mutationFn: async (ids: string[] = []) => {
      const { error } = await supabase.rpc(
        'mark_notifications_read',
        ids.length ? { p_ids: ids } : {}
      )
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
      void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
    },
  })

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
      void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
    },
  })

  const notifications = notificationsQuery.data ?? []
  const alerts = alertsQuery.data ?? []

  return {
    alerts,
    notifications,
    unreadCount: notifications.filter((row) => !row.is_read).length,
    criticalCount: alerts.filter((alert) => alert.severity === 'critical').length,
    isLoading: alertsQuery.isLoading || notificationsQuery.isLoading,
    alertsError: alertsQuery.error,
    notificationsError: notificationsQuery.error,
    refetch: () => {
      void alertsQuery.refetch()
      void notificationsQuery.refetch()
    },
    markRead: markReadMutation.mutateAsync,
    markAllRead: () => markReadMutation.mutateAsync([]),
    isMarkingRead: markReadMutation.isPending,
    deleteNotification: deleteNotificationMutation.mutateAsync,
    isDeletingNotification: deleteNotificationMutation.isPending,
  }
}
