export const SAVE_VERSION = 2
export const SAVE_KEY = 'jumpit-save-v1'
export const DAILY_WIN_LIMIT = 14

const THEMES = new Set(['garden', 'dusk', 'rain', 'lantern'])

export function freshSave() {
  return {
    version: SAVE_VERSION,
    completed: [],
    unlocked: ['garden-1'],
    bestSeeds: {},
    selectedLevel: 'garden-1',
    theme: 'garden',
    muted: false,
    dailyWins: [],
  }
}

export function migrateSave(value) {
  const clean = freshSave()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clean
  if (Array.isArray(value.completed)) clean.completed = [...new Set(value.completed.filter(item => typeof item === 'string'))]
  if (Array.isArray(value.unlocked)) clean.unlocked = [...new Set(['garden-1', ...value.unlocked.filter(item => typeof item === 'string')])]
  if (value.bestSeeds && typeof value.bestSeeds === 'object' && !Array.isArray(value.bestSeeds)) {
    for (const [id, amount] of Object.entries(value.bestSeeds)) {
      if (Number.isInteger(amount) && amount >= 0) clean.bestSeeds[id] = amount
    }
  }
  if (typeof value.selectedLevel === 'string' && clean.unlocked.includes(value.selectedLevel)) clean.selectedLevel = value.selectedLevel
  if (THEMES.has(value.theme)) clean.theme = value.theme
  clean.muted = Boolean(value.muted)
  if (Array.isArray(value.dailyWins)) {
    clean.dailyWins = [...new Set(value.dailyWins.filter(seed => Number.isInteger(seed) && seed > 0))].slice(-DAILY_WIN_LIMIT)
  }
  return clean
}

export function loadSave(storage = globalThis.localStorage) {
  try {
    return migrateSave(JSON.parse(storage?.getItem(SAVE_KEY) || 'null'))
  } catch {
    return freshSave()
  }
}

export function createSaveStore({ storage = globalThis.localStorage, onChange = () => {} } = {}) {
  let state = loadSave(storage)
  let armed = false

  const clone = () => JSON.parse(JSON.stringify(state))
  const write = () => {
    try { storage?.setItem(SAVE_KEY, JSON.stringify(state)) } catch {}
    onChange(clone())
  }

  return {
    get: clone,
    completeLevel(id, seeds, nextId) {
      if (!state.completed.includes(id)) state.completed.push(id)
      state.bestSeeds[id] = Math.max(state.bestSeeds[id] || 0, Number.isFinite(seeds) ? seeds : 0)
      if (nextId && !state.unlocked.includes(nextId)) state.unlocked.push(nextId)
      if (nextId) state.selectedLevel = nextId
      write()
    },
    selectLevel(id) {
      if (!state.unlocked.includes(id)) return false
      state.selectedLevel = id
      write()
      return true
    },
    setTheme(theme) {
      if (!THEMES.has(theme)) return false
      state.theme = theme
      write()
      return true
    },
    completeDaily(seed) {
      if (!Number.isInteger(seed) || seed <= 0 || state.dailyWins.includes(seed)) return false
      state.dailyWins.push(seed)
      state.dailyWins = state.dailyWins.slice(-DAILY_WIN_LIMIT)
      write()
      return true
    },
    setMuted(value) {
      state.muted = Boolean(value)
      write()
      return state.muted
    },
    requestReset() {
      armed = true
      return true
    },
    disarmReset() {
      armed = false
    },
    resetArmed() {
      return armed
    },
    reset() {
      if (!armed) return false
      state = freshSave()
      armed = false
      write()
      return true
    },
  }
}
