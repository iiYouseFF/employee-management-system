import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getTenantId } from '../lib/tenant'

export interface ProductCategory {
  id: string
  name: string
  owner_id: string
  sort_order: number
  created_at: string
}

const QUERY_KEY = ['product_categories']

export function useProductCategories() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return data as ProductCategory[]
    },
  })
}

export function useAddProductCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const tenantId = await getTenantId()
      const { data, error } = await supabase
        .from('product_categories')
        .insert({ name: name.trim(), owner_id: tenantId })
        .select()
        .single()
      if (error) throw error
      return data as ProductCategory
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateProductCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase
        .from('product_categories')
        .update({ name: name.trim() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ProductCategory
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteProductCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
