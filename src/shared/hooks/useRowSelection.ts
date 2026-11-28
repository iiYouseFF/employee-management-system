import { useCallback, useMemo, useState } from 'react'

const EMPTY_IDS: ReadonlySet<string> = new Set()

/**
 * Tracks checkbox selection by row id. `rows` should be the rows currently
 * visible (filtered/paginated). The selection is keyed to that exact set of
 * rows, so changing page or filters discards it instead of acting on stale ids.
 */
export function useRowSelection<T>(rows: T[], getId: (row: T) => string) {
  const visibleIds = useMemo(() => rows.map(getId), [rows, getId])
  const viewKey = JSON.stringify(visibleIds)

  const [state, setState] = useState<{ key: string; ids: Set<string> }>(() => ({
    key: viewKey,
    ids: new Set<string>(),
  }))

  // Reset during render when the visible rows change: returning to a previously
  // seen page/filter must not restore a selection made there earlier.
  if (state.key !== viewKey) {
    setState({ key: viewKey, ids: new Set<string>() })
  }

  const selectedIds: ReadonlySet<string> = state.key === viewKey ? state.ids : EMPTY_IDS

  const update = useCallback(
    (mutate: (ids: Set<string>) => Set<string>) => {
      setState((previous) => ({
        key: viewKey,
        ids: mutate(new Set(previous.key === viewKey ? previous.ids : [])),
      }))
    },
    [viewKey]
  )

  const toggle = useCallback(
    (id: string) => update((ids) => {
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      return ids
    }),
    [update]
  )

  const toggleCurrentPage = useCallback(() => update((ids) => {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => ids.has(id))
    visibleIds.forEach((id) => {
      if (allSelected) ids.delete(id)
      else ids.add(id)
    })
    return ids
  }), [update, visibleIds])

  const clear = useCallback(() => update(() => new Set<string>()), [update])

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(getId(row))),
    [rows, selectedIds, getId]
  )

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])
  const allCurrentPageSelected = rows.length > 0 && rows.every((row) => selectedIds.has(getId(row)))

  return {
    selectedRows,
    count: selectedRows.length,
    isSelected,
    toggle,
    toggleCurrentPage,
    allCurrentPageSelected,
    clear,
  }
}
