export const TILE = 32

export const REGIONS = Object.freeze([
  { id: 'garden', name: 'Garden Walk' },
  { id: 'rooftop', name: 'Rooftop Rain' },
  { id: 'workshop', name: 'Workshop Loft' },
  { id: 'market', name: 'Lantern Market' },
  { id: 'keep', name: 'Beacon Keep' },
])

export const CAMPAIGN_ORDER = Object.freeze([
  'garden-1', 'garden-2', 'garden-3', 'garden-4',
  'rooftop-1', 'rooftop-2', 'rooftop-3', 'rooftop-4',
  'workshop-1', 'workshop-2', 'workshop-3', 'workshop-4',
  'market-1', 'market-2', 'market-3', 'market-4',
  'keep-1', 'keep-2', 'keep-3', 'keep-4',
])

const level = (id, order, region, name, width, spawn, finish, introduces, terrain, objects) => ({
  id, order, region, name, size: [width, 18], spawn, finish, introduces, terrain, objects,
})

// Terrain: [id, kind, x, y, width, height]. Object: [id, kind, x, y].
// Coordinates are tile units; point y is the occupied tile above its support.
export const LEVELS = [
  level('garden-1', 1, 'garden', 'Dewdrop Dash', 38, [2, 14], ['g01-bell', 35, 14], ['run-jump-stomp'], [
    ['g01-a', 'ground', 0, 15, 18, 3], ['g01-b', 'ground', 19, 15, 12, 3],
    ['g01-c', 'ground', 32, 15, 6, 3], ['g01-d', 'leaf', 7, 12, 5, 1],
    ['g01-e', 'leaf', 25, 12, 5, 1],
  ], [
    ['g01-seed-a', 'seed', 4, 14], ['g01-seed-b', 'seed', 10, 11],
    ['g01-seed-c', 'seed', 27, 11], ['g01-check', 'checkpoint', 21, 14],
    ['g01-moss-a', 'mossling', 9, 14],
  ]),

  level('garden-2', 2, 'garden', 'Clover Crossing', 62, [2, 14], ['g02-bell', 59, 14], ['glow-cloak'], [
    ['g02-a', 'ground', 0, 15, 10, 3], ['g02-b', 'ground', 12, 15, 11, 3],
    ['g02-c', 'ground', 26, 15, 12, 3], ['g02-d', 'ground', 41, 15, 21, 3],
    ['g02-e', 'leaf', 7, 12, 4, 1], ['g02-f', 'leaf', 21, 12, 6, 1],
    ['g02-g', 'leaf', 36, 12, 5, 1], ['g02-h', 'leaf', 49, 12, 5, 1],
  ], [
    ['g02-seed-a', 'seed', 8, 11], ['g02-seed-b', 'seed', 23, 11],
    ['g02-seed-c', 'seed', 38, 11], ['g02-seed-d', 'seed', 51, 11],
    ['g02-check', 'checkpoint', 31, 14], ['g02-moss-a', 'mossling', 18, 14],
    ['g02-moss-b', 'mossling', 46, 14], ['g02-cloak', 'cloak', 8, 11],
  ]),

  level('garden-3', 3, 'garden', 'Sunleaf Rise', 66, [2, 14], ['g03-bell', 63, 14], ['leaf-springs'], [
    ['g03-a', 'ground', 0, 15, 9, 3], ['g03-b', 'ground', 12, 15, 13, 3],
    ['g03-c', 'ground', 28, 15, 9, 3], ['g03-d', 'ground', 40, 15, 10, 3],
    ['g03-e', 'ground', 53, 15, 13, 3], ['g03-f', 'leaf', 7, 12, 5, 1],
    ['g03-g', 'leaf', 22, 12, 6, 1], ['g03-h', 'leaf', 35, 12, 5, 1],
    ['g03-i', 'leaf', 48, 12, 6, 1],
  ], [
    ['g03-seed-a', 'seed', 9, 11], ['g03-seed-b', 'seed', 24, 11],
    ['g03-seed-c', 'seed', 37, 11], ['g03-seed-d', 'seed', 51, 11],
    ['g03-check', 'checkpoint', 33, 14], ['g03-moss-a', 'mossling', 18, 14],
    ['g03-moss-b', 'mossling', 45, 14], ['g03-spring', 'spring', 55, 14],
    ['g03-hidden-light', 'hidden-light', 7, 11],
  ]),

  level('garden-4', 4, 'garden', 'Bramble Bank', 70, [2, 14], ['g04-bell', 67, 14], ['crumble-banks'], [
    ['g04-a', 'ground', 0, 15, 12, 3], ['g04-b', 'crumble', 15, 15, 7, 3],
    ['g04-c', 'ground', 24, 15, 11, 3], ['g04-d', 'crumble', 38, 15, 8, 3],
    ['g04-e', 'ground', 49, 15, 8, 3], ['g04-f', 'ground', 60, 15, 10, 3],
    ['g04-g', 'leaf', 9, 12, 6, 1], ['g04-h', 'leaf', 31, 12, 7, 1],
    ['g04-i', 'leaf', 54, 12, 6, 1],
  ], [
    ['g04-seed-a', 'seed', 11, 11], ['g04-seed-b', 'seed', 19, 14],
    ['g04-seed-c', 'seed', 34, 11], ['g04-seed-d', 'seed', 56, 11],
    ['g04-check', 'checkpoint', 33, 14], ['g04-moss-a', 'mossling', 28, 14],
    ['g04-moss-b', 'mossling', 52, 14], ['g04-spring', 'spring', 62, 14],
  ]),

  level('rooftop-1', 5, 'rooftop', 'Chimney Drizzle', 64, [2, 14], ['r01-bell', 61, 14], ['rain-drops'], [
    ['r01-a', 'roof', 0, 15, 13, 3], ['r01-b', 'roof', 16, 15, 10, 3],
    ['r01-c', 'roof', 29, 15, 14, 3], ['r01-d', 'roof', 46, 15, 18, 3],
    ['r01-e', 'awning', 11, 12, 5, 1], ['r01-f', 'awning', 25, 12, 5, 1],
    ['r01-g', 'awning', 40, 12, 6, 1],
  ], [
    ['r01-seed-a', 'seed', 8, 14], ['r01-seed-b', 'seed', 13, 11],
    ['r01-seed-c', 'seed', 27, 11], ['r01-seed-d', 'seed', 42, 11],
    ['r01-check', 'checkpoint', 35, 14], ['r01-drop-a', 'drizzlet', 21, 14],
    ['r01-drop-b', 'drizzlet', 53, 14],
  ]),

  level('rooftop-2', 6, 'rooftop', 'Puddle Parade', 68, [2, 14], ['r02-bell', 65, 14], ['slick-roofs'], [
    ['r02-a', 'roof', 0, 15, 9, 3], ['r02-b', 'slick', 11, 15, 13, 3],
    ['r02-c', 'roof', 27, 15, 10, 3], ['r02-d', 'slick', 40, 15, 12, 3],
    ['r02-e', 'roof', 55, 15, 13, 3], ['r02-f', 'awning', 7, 12, 5, 1],
    ['r02-g', 'awning', 22, 12, 6, 1], ['r02-h', 'awning', 35, 12, 6, 1],
    ['r02-i', 'awning', 50, 12, 5, 1],
  ], [
    ['r02-seed-a', 'seed', 9, 11], ['r02-seed-b', 'seed', 24, 11],
    ['r02-seed-c', 'seed', 38, 11], ['r02-seed-d', 'seed', 52, 11],
    ['r02-check', 'checkpoint', 34, 14], ['r02-drop-a', 'drizzlet', 17, 14],
    ['r02-drop-b', 'drizzlet', 46, 14], ['r02-fan', 'fan', 58, 14],
  ]),

  level('rooftop-3', 7, 'rooftop', 'Awning Alley', 72, [2, 14], ['r03-bell', 69, 14], ['awning-jumps'], [
    ['r03-a', 'roof', 0, 15, 10, 3], ['r03-b', 'roof', 13, 15, 8, 3],
    ['r03-c', 'roof', 24, 15, 9, 3], ['r03-d', 'roof', 36, 15, 10, 3],
    ['r03-e', 'roof', 49, 15, 8, 3], ['r03-f', 'roof', 60, 15, 12, 3],
    ['r03-g', 'awning', 8, 12, 6, 1], ['r03-h', 'awning', 19, 12, 7, 1],
    ['r03-i', 'awning', 31, 12, 7, 1], ['r03-j', 'awning', 44, 12, 7, 1],
    ['r03-k', 'awning', 55, 12, 6, 1],
  ], [
    ['r03-seed-a', 'seed', 10, 11], ['r03-seed-b', 'seed', 22, 11],
    ['r03-seed-c', 'seed', 34, 11], ['r03-seed-d', 'seed', 47, 11],
    ['r03-seed-e', 'seed', 57, 11], ['r03-check', 'checkpoint', 42, 14],
    ['r03-drop-a', 'drizzlet', 17, 14], ['r03-drop-b', 'drizzlet', 52, 14],
    ['r03-hidden-light', 'hidden-light', 31, 11],
  ]),

  level('rooftop-4', 8, 'rooftop', 'Thunder Terrace', 76, [2, 14], ['r04-bell', 73, 14], ['crosswinds'], [
    ['r04-a', 'roof', 0, 15, 11, 3], ['r04-b', 'slick', 14, 15, 10, 3],
    ['r04-c', 'roof', 27, 15, 8, 3], ['r04-d', 'slick', 38, 15, 10, 3],
    ['r04-e', 'roof', 51, 15, 9, 3], ['r04-f', 'roof', 63, 15, 13, 3],
    ['r04-g', 'awning', 9, 12, 6, 1], ['r04-h', 'awning', 22, 12, 6, 1],
    ['r04-i', 'awning', 33, 12, 7, 1], ['r04-j', 'awning', 46, 12, 7, 1],
    ['r04-k', 'awning', 58, 12, 6, 1],
  ], [
    ['r04-seed-a', 'seed', 11, 11], ['r04-seed-b', 'seed', 24, 11],
    ['r04-seed-c', 'seed', 36, 11], ['r04-seed-d', 'seed', 49, 11],
    ['r04-seed-e', 'seed', 60, 11], ['r04-check', 'checkpoint', 43, 14],
    ['r04-drop-a', 'drizzlet', 19, 14], ['r04-drop-b', 'drizzlet', 55, 14],
    ['r04-fan-a', 'fan', 29, 14], ['r04-fan-b', 'fan', 65, 14],
  ]),

  level('workshop-1', 9, 'workshop', 'Sawdust Steps', 66, [2, 14], ['w01-bell', 63, 14], ['gear-runners'], [
    ['w01-a', 'wood', 0, 15, 12, 3], ['w01-b', 'wood', 15, 15, 11, 3],
    ['w01-c', 'wood', 29, 15, 12, 3], ['w01-d', 'wood', 44, 15, 9, 3],
    ['w01-e', 'wood', 56, 15, 10, 3], ['w01-f', 'wood', 9, 12, 6, 1],
    ['w01-g', 'wood', 24, 12, 6, 1], ['w01-h', 'wood', 39, 12, 6, 1],
    ['w01-i', 'wood', 52, 12, 5, 1],
  ], [
    ['w01-seed-a', 'seed', 11, 11], ['w01-seed-b', 'seed', 27, 11],
    ['w01-seed-c', 'seed', 42, 11], ['w01-seed-d', 'seed', 54, 11],
    ['w01-check', 'checkpoint', 35, 14], ['w01-gear-a', 'gearling', 20, 14],
    ['w01-gear-b', 'gearling', 48, 14],
  ]),

  level('workshop-2', 10, 'workshop', 'Belt and Bobbin', 70, [2, 14], ['w02-bell', 67, 14], ['conveyor-belts'], [
    ['w02-a', 'wood', 0, 15, 10, 3], ['w02-b', 'belt', 13, 15, 12, 3],
    ['w02-c', 'wood', 28, 15, 8, 3], ['w02-d', 'belt', 39, 15, 13, 3],
    ['w02-e', 'wood', 55, 15, 15, 3], ['w02-f', 'wood', 8, 12, 6, 1],
    ['w02-g', 'wood', 23, 12, 6, 1], ['w02-h', 'wood', 34, 12, 6, 1],
    ['w02-i', 'wood', 50, 12, 6, 1],
  ], [
    ['w02-seed-a', 'seed', 10, 11], ['w02-seed-b', 'seed', 25, 11],
    ['w02-seed-c', 'seed', 37, 11], ['w02-seed-d', 'seed', 52, 11],
    ['w02-check', 'checkpoint', 44, 14], ['w02-gear-a', 'gearling', 18, 14],
    ['w02-gear-b', 'gearling', 46, 14], ['w02-hidden-light', 'hidden-light', 8, 11],
  ]),

  level('workshop-3', 11, 'workshop', 'Hoist House', 74, [2, 14], ['w03-bell', 71, 14], ['freight-lifts'], [
    ['w03-a', 'wood', 0, 15, 11, 3], ['w03-b', 'wood', 14, 15, 9, 3],
    ['w03-c', 'wood', 26, 15, 10, 3], ['w03-d', 'wood', 39, 15, 8, 3],
    ['w03-e', 'wood', 50, 15, 11, 3], ['w03-f', 'wood', 64, 15, 10, 3],
    ['w03-g', 'lift', 9, 12, 5, 1], ['w03-h', 'lift', 21, 12, 6, 1],
    ['w03-i', 'lift', 34, 12, 6, 1], ['w03-j', 'lift', 45, 12, 7, 1],
    ['w03-k', 'lift', 59, 12, 6, 1],
  ], [
    ['w03-seed-a', 'seed', 11, 11], ['w03-seed-b', 'seed', 24, 11],
    ['w03-seed-c', 'seed', 37, 11], ['w03-seed-d', 'seed', 48, 11],
    ['w03-seed-e', 'seed', 61, 11], ['w03-check', 'checkpoint', 43, 14],
    ['w03-gear-a', 'gearling', 18, 14], ['w03-gear-b', 'gearling', 55, 14],
  ]),

  level('workshop-4', 12, 'workshop', 'Switchback Rafters', 78, [2, 14], ['w04-bell', 75, 14], ['switch-bridges'], [
    ['w04-a', 'wood', 0, 15, 12, 3], ['w04-b', 'belt', 15, 15, 8, 3],
    ['w04-c', 'wood', 26, 15, 9, 3], ['w04-d', 'belt', 38, 15, 9, 3],
    ['w04-e', 'wood', 50, 15, 9, 3], ['w04-f', 'wood', 62, 15, 16, 3],
    ['w04-g', 'lift', 10, 12, 6, 1], ['w04-h', 'bridge', 21, 12, 6, 1],
    ['w04-i', 'lift', 33, 12, 7, 1], ['w04-j', 'bridge', 45, 12, 7, 1],
    ['w04-k', 'lift', 57, 12, 7, 1],
  ], [
    ['w04-seed-a', 'seed', 12, 11], ['w04-seed-b', 'seed', 23, 11],
    ['w04-seed-c', 'seed', 36, 11], ['w04-seed-d', 'seed', 48, 11],
    ['w04-seed-e', 'seed', 60, 11], ['w04-check', 'checkpoint', 44, 14],
    ['w04-gear-a', 'gearling', 19, 14], ['w04-gear-b', 'gearling', 54, 14],
    ['w04-switch-a', 'switch', 16, 14], ['w04-switch-b', 'switch', 40, 14],
  ]),

  level('market-1', 13, 'market', 'Paper Lantern Lane', 68, [2, 14], ['m01-bell', 65, 14], ['market-moths'], [
    ['m01-a', 'stall', 0, 15, 13, 3], ['m01-b', 'stall', 16, 15, 10, 3],
    ['m01-c', 'stall', 29, 15, 12, 3], ['m01-d', 'stall', 44, 15, 9, 3],
    ['m01-e', 'stall', 56, 15, 12, 3], ['m01-f', 'lantern', 10, 12, 6, 1],
    ['m01-g', 'lantern', 24, 12, 6, 1], ['m01-h', 'lantern', 39, 12, 6, 1],
    ['m01-i', 'lantern', 52, 12, 6, 1],
  ], [
    ['m01-seed-a', 'seed', 12, 11], ['m01-seed-b', 'seed', 27, 11],
    ['m01-seed-c', 'seed', 42, 11], ['m01-seed-d', 'seed', 55, 11],
    ['m01-check', 'checkpoint', 35, 14], ['m01-moth-a', 'mothlight', 21, 14],
    ['m01-moth-b', 'mothlight', 49, 14],
  ]),

  level('market-2', 14, 'market', 'Moonrise Canopy', 72, [2, 14], ['m02-bell', 69, 14], ['lantern-perches'], [
    ['m02-a', 'stall', 0, 15, 10, 3], ['m02-b', 'stall', 13, 15, 11, 3],
    ['m02-c', 'stall', 27, 15, 8, 3], ['m02-d', 'stall', 38, 15, 12, 3],
    ['m02-e', 'stall', 53, 15, 8, 3], ['m02-f', 'stall', 64, 15, 8, 3],
    ['m02-g', 'lantern', 8, 12, 6, 1], ['m02-h', 'lantern', 22, 12, 6, 1],
    ['m02-i', 'lantern', 33, 12, 7, 1], ['m02-j', 'lantern', 48, 12, 6, 1],
    ['m02-k', 'lantern', 59, 12, 6, 1],
  ], [
    ['m02-seed-a', 'seed', 10, 11], ['m02-seed-b', 'seed', 24, 11],
    ['m02-seed-c', 'seed', 36, 11], ['m02-seed-d', 'seed', 50, 11],
    ['m02-seed-e', 'seed', 61, 11], ['m02-check', 'checkpoint', 43, 14],
    ['m02-moth-a', 'mothlight', 18, 14], ['m02-moth-b', 'mothlight', 57, 14],
    ['m02-lamp', 'lamp', 66, 14],
  ]),

  level('market-3', 15, 'market', 'Stalltop Shuffle', 76, [2, 14], ['m03-bell', 73, 14], ['moving-stalls'], [
    ['m03-a', 'stall', 0, 15, 11, 3], ['m03-b', 'stall', 14, 15, 8, 3],
    ['m03-c', 'stall', 25, 15, 10, 3], ['m03-d', 'stall', 38, 15, 9, 3],
    ['m03-e', 'stall', 50, 15, 10, 3], ['m03-f', 'stall', 63, 15, 13, 3],
    ['m03-g', 'lift', 9, 12, 6, 1], ['m03-h', 'lantern', 20, 12, 7, 1],
    ['m03-i', 'lift', 33, 12, 6, 1], ['m03-j', 'lantern', 45, 12, 7, 1],
    ['m03-k', 'lift', 58, 12, 6, 1],
  ], [
    ['m03-seed-a', 'seed', 11, 11], ['m03-seed-b', 'seed', 23, 11],
    ['m03-seed-c', 'seed', 35, 11], ['m03-seed-d', 'seed', 48, 11],
    ['m03-seed-e', 'seed', 60, 11], ['m03-check', 'checkpoint', 43, 14],
    ['m03-moth-a', 'mothlight', 18, 14], ['m03-moth-b', 'mothlight', 54, 14],
    ['m03-hidden-light', 'hidden-light', 26, 11],
  ]),

  level('market-4', 16, 'market', 'Last-Light Arcade', 80, [2, 14], ['m04-bell', 77, 14], ['shadow-gates'], [
    ['m04-a', 'stall', 0, 15, 12, 3], ['m04-b', 'shade', 15, 15, 9, 3],
    ['m04-c', 'stall', 27, 15, 8, 3], ['m04-d', 'shade', 38, 15, 10, 3],
    ['m04-e', 'stall', 51, 15, 9, 3], ['m04-f', 'shade', 63, 15, 8, 3],
    ['m04-g', 'stall', 74, 15, 6, 3], ['m04-h', 'lantern', 10, 12, 6, 1],
    ['m04-i', 'lantern', 22, 12, 7, 1], ['m04-j', 'lantern', 34, 12, 7, 1],
    ['m04-k', 'lantern', 46, 12, 7, 1], ['m04-l', 'lantern', 58, 12, 7, 1],
    ['m04-m', 'lantern', 69, 12, 6, 1],
  ], [
    ['m04-seed-a', 'seed', 12, 11], ['m04-seed-b', 'seed', 25, 11],
    ['m04-seed-c', 'seed', 37, 11], ['m04-seed-d', 'seed', 49, 11],
    ['m04-seed-e', 'seed', 61, 11], ['m04-seed-f', 'seed', 71, 11],
    ['m04-check', 'checkpoint', 45, 14], ['m04-moth-a', 'mothlight', 19, 14],
    ['m04-moth-b', 'mothlight', 55, 14], ['m04-gate-a', 'gate', 31, 14],
    ['m04-gate-b', 'gate', 68, 14], ['m04-lamp-a', 'lamp', 28, 14],
    ['m04-lamp-b', 'lamp', 65, 14],
  ]),

  level('keep-1', 17, 'keep', 'Gatehouse Glow', 72, [2, 14], ['k01-bell', 64, 8], ['stone-sentries'], [
    ['k01-a', 'stone', 0, 15, 11, 3], ['k01-b', 'stone', 15, 15, 10, 3],
    ['k01-c', 'stone', 29, 15, 10, 3], ['k01-d', 'stone', 43, 15, 9, 3],
    ['k01-e', 'stone', 56, 15, 16, 3], ['k01-f', 'beacon', 8, 13, 6, 1],
    ['k01-g', 'stone', 13, 11, 6, 1], ['k01-h', 'beacon', 18, 9, 7, 1],
    ['k01-i', 'stone', 24, 11, 7, 1], ['k01-j', 'beacon', 29, 13, 7, 1],
    ['k01-k', 'stone', 37, 13, 8, 1], ['k01-l', 'stone', 48, 13, 7, 1],
    ['k01-m', 'beacon', 53, 11, 7, 1], ['k01-n', 'stone', 59, 9, 8, 1],
  ], [
    ['k01-seed-a', 'seed', 10, 12], ['k01-seed-b', 'seed', 15, 10],
    ['k01-seed-c', 'seed', 21, 8], ['k01-seed-d', 'seed', 32, 12],
    ['k01-seed-e', 'seed', 55, 10], ['k01-seed-f', 'seed', 62, 8],
    ['k01-check', 'checkpoint', 46, 14], ['k01-sentry-a', 'sentry', 34, 14],
    ['k01-hidden-light', 'hidden-light', 8, 12],
  ]),

  level('keep-2', 18, 'keep', 'Bellrope Gallery', 78, [2, 14], ['k02-bell', 75, 6], ['keep-lifts'], [
    ['k02-a', 'stone', 0, 15, 10, 3], ['k02-b', 'stone', 13, 15, 9, 3],
    ['k02-c', 'stone', 26, 15, 10, 3], ['k02-d', 'stone', 39, 15, 9, 3],
    ['k02-e', 'stone', 53, 15, 9, 3], ['k02-f', 'stone', 66, 15, 12, 3],
    ['k02-g', 'lift', 7, 13, 6, 1], ['k02-h', 'beacon', 12, 11, 7, 1],
    ['k02-i', 'lift', 18, 9, 7, 1], ['k02-j', 'beacon', 24, 11, 7, 1],
    ['k02-k', 'lift', 30, 13, 7, 1], ['k02-l', 'beacon', 41, 13, 7, 1],
    ['k02-m', 'lift', 46, 11, 7, 1], ['k02-n', 'beacon', 52, 9, 7, 1],
    ['k02-o', 'lift', 58, 7, 7, 1], ['k02-p', 'beacon', 64, 9, 7, 1],
    ['k02-q', 'lift', 70, 7, 8, 1],
  ], [
    ['k02-seed-a', 'seed', 6, 14], ['k02-seed-b', 'seed', 15, 10],
    ['k02-seed-c', 'seed', 27, 10], ['k02-seed-d', 'seed', 44, 12],
    ['k02-seed-e', 'seed', 55, 8], ['k02-seed-f', 'seed', 73, 6],
    ['k02-check', 'checkpoint', 46, 12], ['k02-sentry-a', 'sentry', 29, 14],
    ['k02-sentry-b', 'sentry', 67, 8],
  ]),

  level('keep-3', 19, 'keep', 'Windward Tower', 84, [2, 14], ['k03-bell', 81, 6], ['tower-gusts'], [
    ['k03-a', 'stone', 0, 15, 10, 3], ['k03-b', 'crumble', 13, 15, 8, 3],
    ['k03-c', 'stone', 24, 15, 9, 3], ['k03-d', 'crumble', 36, 15, 8, 3],
    ['k03-e', 'stone', 58, 15, 9, 3], ['k03-f', 'stone', 70, 15, 14, 3],
    ['k03-g', 'lift', 7, 13, 6, 1], ['k03-h', 'beacon', 12, 11, 7, 1],
    ['k03-i', 'stone', 18, 9, 7, 1], ['k03-j', 'beacon', 24, 11, 7, 1],
    ['k03-k', 'lift', 30, 13, 7, 1], ['k03-l', 'beacon', 41, 13, 7, 1],
    ['k03-m', 'lift', 46, 11, 7, 1], ['k03-n', 'beacon', 51, 9, 7, 1],
    ['k03-o', 'lift', 56, 11, 7, 1], ['k03-p', 'beacon', 61, 13, 7, 1],
    ['k03-q', 'stone', 63, 13, 7, 1], ['k03-r', 'lift', 68, 11, 7, 1],
    ['k03-s', 'beacon', 73, 9, 7, 1], ['k03-t', 'lift', 78, 7, 6, 1],
  ], [
    ['k03-seed-a', 'seed', 9, 12], ['k03-seed-b', 'seed', 15, 10],
    ['k03-seed-c', 'seed', 21, 8], ['k03-seed-d', 'seed', 43, 12],
    ['k03-seed-e', 'seed', 56, 8], ['k03-seed-f', 'seed', 66, 12],
    ['k03-seed-g', 'seed', 80, 6], ['k03-check', 'checkpoint', 43, 12],
    ['k03-sentry-a', 'sentry', 17, 14], ['k03-sentry-b', 'sentry', 64, 12],
    ['k03-sentry-c', 'sentry', 76, 8], ['k03-fan-a', 'fan', 42, 14],
    ['k03-fan-b', 'fan', 72, 14],
  ]),

  level('keep-4', 20, 'keep', 'The Waking Beacon', 96, [2, 14], ['k04-bell', 93, 14], ['beacon-guardian'], [
    ['k04-a', 'stone', 0, 15, 11, 3], ['k04-b', 'stone', 14, 15, 9, 3],
    ['k04-c', 'crumble', 26, 15, 9, 3], ['k04-d', 'stone', 38, 15, 8, 3],
    ['k04-e', 'stone', 58, 15, 9, 3], ['k04-f', 'stone', 70, 15, 5, 3],
    ['k04-arena', 'stone', 76, 15, 20, 3], ['k04-h', 'beacon', 8, 13, 6, 1],
    ['k04-i', 'lift', 13, 11, 7, 1], ['k04-j', 'beacon', 18, 9, 7, 1],
    ['k04-k', 'lift', 24, 11, 7, 1], ['k04-l', 'beacon', 30, 13, 7, 1],
    ['k04-m', 'beacon', 43, 13, 7, 1], ['k04-n', 'lift', 48, 11, 7, 1],
    ['k04-o', 'beacon', 53, 9, 7, 1], ['k04-p', 'lift', 58, 7, 7, 1],
    ['k04-q', 'beacon', 63, 9, 7, 1], ['k04-r', 'lift', 68, 11, 7, 1],
    ['k04-s', 'beacon', 70, 13, 5, 1],
  ], [
    ['k04-seed-a', 'seed', 10, 12], ['k04-seed-b', 'seed', 24, 8],
    ['k04-seed-c', 'seed', 35, 12], ['k04-seed-d', 'seed', 51, 10],
    ['k04-seed-e', 'seed', 61, 6], ['k04-seed-f', 'seed', 68, 8],
    ['k04-check', 'checkpoint', 72, 14], ['k04-sentry-a', 'sentry', 19, 8],
    ['k04-sentry-b', 'sentry', 31, 12], ['k04-sentry-c', 'sentry', 64, 8],
    ['k04-warden', 'warden', 84, 14], ['k04-fan', 'fan', 44, 14],
  ]),
]

const TERRAIN_KINDS = new Set([
  'ground', 'leaf', 'crumble', 'roof', 'slick', 'awning', 'wood', 'belt',
  'lift', 'bridge', 'stall', 'lantern', 'shade', 'stone', 'beacon',
])
const OBJECT_KINDS = new Set([
  'seed', 'checkpoint', 'mossling', 'spring', 'drizzlet', 'fan', 'gearling',
  'switch', 'mothlight', 'lamp', 'gate', 'sentry', 'warden', 'cloak', 'hidden-light',
])
const ENEMY_KINDS = new Set(['mossling', 'drizzlet', 'gearling', 'mothlight', 'sentry', 'warden'])
const integer = value => Number.isInteger(value)
const pointInBounds = ([x, y], [width, height]) => integer(x) && integer(y) && x >= 0 && y >= 0 && x < width && y < height
const contains = (terrain, x, y) => x >= terrain[2] && x < terrain[2] + terrain[4] && y >= terrain[3] && y < terrain[3] + terrain[5]
const supports = (terrain, x, y) => x >= terrain[2] && x < terrain[2] + terrain[4] && y === terrain[3] - 1

function jumpable(from, to) {
  const fromLeft = from[2]
  const fromRight = fromLeft + from[4]
  const toLeft = to[2]
  const toRight = toLeft + to[4]
  const gap = Math.max(0, toLeft - fromRight, fromLeft - toRight)
  const rise = from[3] - to[3]
  const drop = to[3] - from[3]
  return gap <= 3 && rise <= 3 && drop <= 6
}

function reachableTerrain(terrain, start) {
  const first = terrain.findIndex(tile => supports(tile, start[0], start[1]))
  if (first < 0) return new Set()
  const seen = new Set([first])
  const queue = [first]
  while (queue.length) {
    const current = queue.shift()
    for (let next = 0; next < terrain.length; next += 1) {
      if (!seen.has(next) && jumpable(terrain[current], terrain[next])) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

function hasPit(terrain, height) {
  const floor = terrain
    .filter(tile => tile[3] + tile[5] === height)
    .map(tile => [tile[2], tile[2] + tile[4]])
    .sort((a, b) => a[0] - b[0])
  let edge = floor[0]?.[1]
  for (const [left, right] of floor.slice(1)) {
    if (left > edge) return true
    edge = Math.max(edge, right)
  }
  return false
}

export function validateCampaign(campaign = LEVELS) {
  const errors = []
  if (!Array.isArray(campaign)) return ['campaign must be an array']
  if (campaign.length !== CAMPAIGN_ORDER.length) errors.push(`campaign must contain ${CAMPAIGN_ORDER.length} levels`)

  const ids = new Map()
  const features = new Set()
  const hiddenLightsByRegion = new Map(REGIONS.map(region => [region.id, 0]))
  const claim = (id, where) => {
    if (typeof id !== 'string' || !id) return errors.push(`${where}: id must be a non-empty string`)
    if (ids.has(id)) errors.push(`${where}: duplicate id ${id} (first used by ${ids.get(id)})`)
    else ids.set(id, where)
  }

  campaign.forEach((entry, index) => {
    const where = `level ${index + 1}`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${where}: level must be an object`)
      return
    }

    claim(entry.id, where)
    const expectedId = CAMPAIGN_ORDER[index]
    if (entry.id !== expectedId) errors.push(`${where}: expected campaign id ${expectedId}`)
    if (entry.order !== index + 1) errors.push(`${where}: order must be ${index + 1}`)
    const expectedRegion = REGIONS[Math.floor(index / 4)]?.id
    if (entry.region !== expectedRegion) errors.push(`${where}: region must be ${expectedRegion}`)
    if (typeof entry.name !== 'string' || !entry.name.trim()) errors.push(`${where}: name must be present`)

    const sizeOk = Array.isArray(entry.size) && entry.size.length === 2 && entry.size.every(integer) && entry.size[0] > 0 && entry.size[1] > 0
    if (!sizeOk) errors.push(`${where}: size must be two positive integers`)
    const size = sizeOk ? entry.size : [0, 0]

    const spawnOk = Array.isArray(entry.spawn) && entry.spawn.length === 2 && pointInBounds(entry.spawn, size)
    if (!spawnOk) errors.push(`${where}: spawn must be an in-bounds integer point`)

    const finishOk = Array.isArray(entry.finish) && entry.finish.length === 3 && pointInBounds(entry.finish.slice(1), size)
    if (!finishOk) errors.push(`${where}: finish bell must be [id, x, y] in bounds`)
    if (Array.isArray(entry.finish)) claim(entry.finish[0], `${where} finish`)

    if (!Array.isArray(entry.introduces) || entry.introduces.length === 0) {
      errors.push(`${where}: introduces must name a new mechanic`)
    } else {
      for (const feature of entry.introduces) {
        if (typeof feature !== 'string' || !feature) errors.push(`${where}: introduced mechanic must be a non-empty string`)
        else if (features.has(feature)) errors.push(`${where}: mechanic ${feature} was already introduced`)
        else features.add(feature)
      }
    }

    const terrain = Array.isArray(entry.terrain) ? entry.terrain : []
    if (!Array.isArray(entry.terrain) || terrain.length < 2) errors.push(`${where}: terrain must contain at least two platforms`)
    const validTerrain = []
    for (const [terrainIndex, tile] of terrain.entries()) {
      const tileWhere = `${where} terrain ${terrainIndex + 1}`
      if (!Array.isArray(tile) || tile.length !== 6) {
        errors.push(`${tileWhere}: expected [id, kind, x, y, width, height]`)
        continue
      }
      claim(tile[0], tileWhere)
      if (!TERRAIN_KINDS.has(tile[1])) errors.push(`${tileWhere}: unknown kind ${tile[1]}`)
      const box = tile.slice(2)
      if (!box.every(integer) || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] > size[0] || box[1] + box[3] > size[1]) {
        errors.push(`${tileWhere}: rectangle is out of bounds`)
      } else validTerrain.push(tile)
    }
    if (sizeOk && !hasPit(validTerrain, size[1])) errors.push(`${where}: terrain must include a pit`)

    const objects = Array.isArray(entry.objects) ? entry.objects : []
    if (!Array.isArray(entry.objects)) errors.push(`${where}: objects must be an array`)
    let seeds = 0
    let checkpoints = 0
    let enemies = 0
    const validObjects = []
    for (const [objectIndex, object] of objects.entries()) {
      const objectWhere = `${where} object ${objectIndex + 1}`
      if (!Array.isArray(object) || object.length !== 4) {
        errors.push(`${objectWhere}: expected [id, kind, x, y]`)
        continue
      }
      claim(object[0], objectWhere)
      if (!OBJECT_KINDS.has(object[1])) errors.push(`${objectWhere}: unknown kind ${object[1]}`)
      if (!pointInBounds(object.slice(2), size)) errors.push(`${objectWhere}: point is out of bounds`)
      else validObjects.push(object)
      if (object[1] === 'seed') seeds += 1
      if (object[1] === 'checkpoint') checkpoints += 1
      if (object[1] === 'hidden-light') {
        hiddenLightsByRegion.set(entry.region, (hiddenLightsByRegion.get(entry.region) || 0) + 1)
      }
      if (ENEMY_KINDS.has(object[1])) enemies += 1
    }
    if (seeds < 3) errors.push(`${where}: needs at least three seed collectibles`)
    if (checkpoints !== 1) errors.push(`${where}: needs exactly one checkpoint`)
    if (index > 0 && enemies === 0) errors.push(`${where}: needs a progressive enemy encounter`)

    for (const object of validObjects.filter(item => ['seed', 'checkpoint', 'hidden-light'].includes(item[1]))) {
      if (validTerrain.some(tile => contains(tile, object[2], object[3]))) {
        errors.push(`${where}: ${object[0]} is embedded in terrain`)
      }
    }

    if (spawnOk && !validTerrain.some(tile => supports(tile, entry.spawn[0], entry.spawn[1]))) {
      errors.push(`${where}: spawn has no supporting terrain`)
    }
    if (finishOk && !validTerrain.some(tile => supports(tile, entry.finish[1], entry.finish[2]))) {
      errors.push(`${where}: finish bell has no supporting terrain`)
    }
    const checkpoint = validObjects.find(([, kind]) => kind === 'checkpoint')
    if (checkpoint && !validTerrain.some(tile =>
      tile[1] !== 'crumble' && supports(tile, checkpoint[2], checkpoint[3]))) {
      errors.push(`${where}: ${checkpoint[0]} must have stable supporting terrain`)
    }

    if (spawnOk) {
      const reachable = reachableTerrain(validTerrain, entry.spawn)
      const reachablePoint = ([x, y]) => validTerrain.some((tile, tileIndex) => reachable.has(tileIndex) && supports(tile, x, y))
      if (finishOk && !reachablePoint(entry.finish.slice(1))) errors.push(`${where}: finish bell is outside the conservative jump envelope`)
      for (const object of validObjects.filter(item => ['seed', 'checkpoint', 'hidden-light'].includes(item[1]))) {
        if (!reachablePoint(object.slice(2))) errors.push(`${where}: ${object[0]} is outside the conservative jump envelope`)
      }
    }
  })

  for (const region of REGIONS) {
    const count = hiddenLightsByRegion.get(region.id) || 0
    if (count !== 1) errors.push(`${region.name}: needs exactly one hidden light, found ${count}`)
  }

  return errors
}

export function assertCampaign(campaign = LEVELS) {
  const errors = validateCampaign(campaign)
  if (errors.length) throw new Error(`Invalid Jumpit campaign:\n- ${errors.join('\n- ')}`)
  return campaign
}
