export function createRelease(levels, count) {
  const released = levels.slice(0, count)
  const ids = new Set(released.map(level => level.id))

  return {
    levels: released,
    next(id) {
      const index = released.findIndex(level => level.id === id)
      return index >= 0 ? released[index + 1]?.id || null : null
    },
    playable(preferred, unlocked = []) {
      if (ids.has(preferred) && unlocked.includes(preferred)) return preferred
      for (let index = released.length - 1; index >= 0; index -= 1) {
        if (unlocked.includes(released[index].id)) return released[index].id
      }
      return released[0]?.id || null
    },
    find(id) {
      return ids.has(id) ? released.find(level => level.id === id) : null
    },
  }
}
