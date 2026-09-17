export function createRelease<T extends { id: string }>(levels: readonly T[], count: number) {
  const released = levels.slice(0, count)
  const ids = new Set(released.map(level => level.id))
  return {
    levels: released,
    next(id: string | null) {
      const index = released.findIndex(level => level.id === id)
      return index >= 0 ? released[index + 1]?.id || null : null
    },
    playable(preferred: string | null, unlocked: readonly string[] = []) {
      if (preferred !== null && ids.has(preferred) && unlocked.includes(preferred)) return preferred
      for (let index = released.length - 1; index >= 0; index -= 1) {
        if (unlocked.includes(released[index].id)) return released[index].id
      }
      return released[0]?.id || null
    },
    find(id: string | null) {
      return id !== null && ids.has(id) ? released.find(level => level.id === id) : null
    },
  }
}
