import { LEVELS } from './levels.ts'

export const SAVE_VERSION = 3
export const SAVE_KEY = 'jumpit-save-v1'
export const DAILY_WIN_LIMIT = 14
export type Theme = 'garden' | 'dusk' | 'rain' | 'lantern'
export interface Save {
  version: number
  completed: string[]
  unlocked: string[]
  bestSeeds: Record<string, number>
  selectedLevel: string
  theme: Theme
  muted: boolean
  dailyWins: number[]
  hiddenLights: string[]
  controlsLearned: boolean
}
type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>
const THEMES = new Set<string>(['garden', 'dusk', 'rain', 'lantern'])
const isTheme = (value: unknown): value is Theme => typeof value === 'string' && THEMES.has(value)
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const HIDDEN_LIGHT_IDS = new Set(LEVELS.flatMap(level =>
  level.objects.filter(([, kind]) => kind === 'hidden-light').map(([id]) => id)))
const SEED_MAX = new Map(LEVELS.map(level => [
  level.id, level.objects.filter(([, kind]) => kind === 'seed').length,
]))

export function hasGoldBell(state: Save, levelId: string) {
  const maximum = SEED_MAX.get(levelId)
  return Boolean(maximum && state.completed.includes(levelId) && state.bestSeeds[levelId] === maximum)
}

export function freshSave(): Save {
  return { version: SAVE_VERSION, completed: [], unlocked: ['garden-1'], bestSeeds: {},
    selectedLevel: 'garden-1', theme: 'garden', muted: false, dailyWins: [],
    hiddenLights: [], controlsLearned: false }
}

export function migrateSave(value: unknown): Save {
  const clean = freshSave()
  if (!isRecord(value)) return clean
  if (Array.isArray(value.completed)) clean.completed = [...new Set(value.completed.filter((item): item is string => typeof item === 'string'))]
  if (Array.isArray(value.unlocked)) clean.unlocked = [...new Set(['garden-1', ...value.unlocked.filter((item): item is string => typeof item === 'string')])]
  if (isRecord(value.bestSeeds)) {
    for (const [id, amount] of Object.entries(value.bestSeeds)) {
      const max = SEED_MAX.get(id)
      if (max !== undefined && typeof amount === 'number' && Number.isInteger(amount) && amount >= 0) clean.bestSeeds[id] = Math.min(amount, max)
    }
  }
  if (typeof value.selectedLevel === 'string' && clean.unlocked.includes(value.selectedLevel)) clean.selectedLevel = value.selectedLevel
  if (isTheme(value.theme)) clean.theme = value.theme
  clean.muted = Boolean(value.muted)
  if (Array.isArray(value.dailyWins)) {
    clean.dailyWins = [...new Set(value.dailyWins.filter((seed): seed is number => typeof seed === 'number' && Number.isInteger(seed) && seed > 0))].slice(-DAILY_WIN_LIMIT)
  }
  if (Array.isArray(value.hiddenLights)) {
    clean.hiddenLights = [...new Set(value.hiddenLights.filter((id): id is string => typeof id === 'string' && HIDDEN_LIGHT_IDS.has(id)))]
  }
  clean.controlsLearned = value.controlsLearned === true
  return clean
}

function defaultStorage(): SaveStorage | undefined {
  // A denied storage getter must not prevent the in-memory game from booting.
  try { return globalThis.localStorage } catch { return undefined }
}

export function loadSave(storage: SaveStorage | undefined = defaultStorage()) {
  try { return migrateSave(JSON.parse(storage?.getItem(SAVE_KEY) || 'null')) }
  catch { return freshSave() }
}

export function createSaveStore({ storage = defaultStorage(), onChange = () => {} }: {
  storage?: SaveStorage
  onChange?: (save: Save) => void
} = {}) {
  let state = loadSave(storage)
  let armed = false
  const clone = (): Save => ({ ...state, completed: [...state.completed], unlocked: [...state.unlocked],
    bestSeeds: { ...state.bestSeeds }, dailyWins: [...state.dailyWins], hiddenLights: [...state.hiddenLights] })
  const write = () => {
    try { storage?.setItem(SAVE_KEY, JSON.stringify(state)) } catch {}
    onChange(clone())
  }
  return {
    get: clone,
    completeLevel(id: string, seeds: number, nextId: string | null) {
      if (!state.completed.includes(id)) state.completed.push(id)
      const max = SEED_MAX.get(id) || 0
      const safeSeeds = Number.isFinite(seeds) ? Math.max(0, Math.min(max, Math.floor(seeds))) : 0
      state.bestSeeds[id] = Math.max(state.bestSeeds[id] || 0, safeSeeds)
      if (nextId && !state.unlocked.includes(nextId)) state.unlocked.push(nextId)
      if (nextId) state.selectedLevel = nextId
      write()
    },
    selectLevel(id: string) {
      if (!state.unlocked.includes(id)) return false
      state.selectedLevel = id
      write()
      return true
    },
    setTheme(theme: string) {
      if (!isTheme(theme)) return false
      state.theme = theme
      write()
      return true
    },
    completeDaily(seed: number) {
      if (!Number.isInteger(seed) || seed <= 0 || state.dailyWins.includes(seed)) return false
      state.dailyWins.push(seed)
      state.dailyWins = state.dailyWins.slice(-DAILY_WIN_LIMIT)
      write()
      return true
    },
    findHiddenLight(id: string) {
      if (!HIDDEN_LIGHT_IDS.has(id) || state.hiddenLights.includes(id)) return false
      state.hiddenLights.push(id)
      write()
      return true
    },
    learnControls() {
      if (state.controlsLearned) return false
      state.controlsLearned = true
      write()
      return true
    },
    setMuted(value: unknown) {
      state.muted = Boolean(value)
      write()
      return state.muted
    },
    requestReset() { armed = true; return true },
    disarmReset() { armed = false },
    resetArmed() { return armed },
    reset() {
      if (!armed) return false
      state = freshSave()
      armed = false
      write()
      return true
    },
  }
}
