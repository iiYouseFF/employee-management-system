import { useAuth } from './useAuth'

export function useRole() {
  const { user, repProfile, role, isRep, isReadOnly, isManager, loading } = useAuth()
  return {
    user,
    repProfile,
    role,
    isManager,
    isSalesRep: isRep,
    isReadOnly,
    loading,
  }
}
