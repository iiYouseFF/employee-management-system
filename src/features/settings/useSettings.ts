import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

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
