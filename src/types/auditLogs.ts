export interface AuditLogEntry {
  id: string
  owner_id: string
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  actor_role: string | null
  table_name: string
  record_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data: Record<string, any> | null
  new_data: Record<string, any> | null
  changed_fields: string[] | null
  description: string | null
  created_at: string
}

export interface AuditLogFilters {
  table_name?: string
  action?: 'INSERT' | 'UPDATE' | 'DELETE' | 'all'
  startDate?: string
  endDate?: string
  search?: string
  actor_id?: string
}
