import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getTenantId } from '../lib/tenant'
import type { RepDirectoryRow, RepFormValues } from '../types/reps'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: any) => {
      const tenantId = await getTenantId()
      const { data, error } = await supabase
        .from('app_settings')
        .update(updates)
        .eq('owner_id', tenantId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

export function useReps() {
  return useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reps')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
  })
}

export function useAddRep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, email, phone, notes, monthly_target, is_active }: RepFormValues) => {
      const tenantId = await getTenantId()
      const { data, error } = await supabase
        .from('reps')
        .insert({
          name: name.trim(),
          email: email?.trim().toLowerCase() || null,
          phone: phone?.trim() || null,
          notes: notes?.trim() || null,
          monthly_target: monthly_target ?? 0,
          is_active: is_active ?? true,
          owner_id: tenantId,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reps'] })
      queryClient.invalidateQueries({ queryKey: ['rep_directory'] })
    },
  })
}

export function useUpdateRep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, email, phone, notes, monthly_target, is_active }: RepFormValues & { id: string }) => {
      const { data, error } = await supabase
        .from('reps')
        .update({
          name: name.trim(),
          email: email?.trim().toLowerCase() || null,
          phone: phone?.trim() || null,
          notes: notes?.trim() || null,
          monthly_target: monthly_target ?? 0,
          is_active: is_active ?? true,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reps'] })
      queryClient.invalidateQueries({ queryKey: ['rep_directory'] })
    },
  })
}

export function useDeleteRep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (repId: string) => {
      const { error } = await supabase
        .from('reps')
        .delete()
        .eq('id', repId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reps'] })
      queryClient.invalidateQueries({ queryKey: ['rep_directory'] })
    },
  })
}

export function useRepDirectory() {
  return useQuery({
    queryKey: ['rep_directory'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rep_directory')
      if (error) throw error
      return (data || []) as unknown as RepDirectoryRow[]
    },
  })
}
