import { rng } from './seed.ts'
export interface DailyChallenge { id: string; title: string; levelId: string; goalSeeds: number; copy: string }
export const DAILY_CHALLENGES: DailyChallenge[] = [
  { id: 'seedling-sprint', title: 'SEEDLING SPRINT', levelId: 'garden-2', goalSeeds: 3, copy: 'Find 3 seeds, then ring the bell.' },
  { id: 'rainy-rooftops', title: 'RAINY ROOFTOPS', levelId: 'rooftop-2', goalSeeds: 3, copy: 'Bring 3 seeds across the slick roofs.' },
  { id: 'loft-light', title: 'LOFT LIGHT', levelId: 'workshop-3', goalSeeds: 4, copy: 'Ride the lifts with 4 seeds.' },
  { id: 'market-glow', title: 'MARKET GLOW', levelId: 'market-2', goalSeeds: 4, copy: 'Carry 4 seeds through Lantern Market.' },
]
export function dailyChallenge(seed: number) {
  const random = rng(Number(seed) || 1)
  return DAILY_CHALLENGES[Math.floor(random() * DAILY_CHALLENGES.length)]
}
export function challengeWon(challenge: Pick<DailyChallenge, 'goalSeeds'>, state: { finished: boolean; seeds: number }) {
  return Boolean(state.finished && state.seeds >= challenge.goalSeeds)
}
