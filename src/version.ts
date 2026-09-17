// Unbundled unit tests have no build defines. Release builds validate identity first.
export const VERSION = typeof __APP_VERSION__ === 'undefined' ? '2.1.0-dev' : __APP_VERSION__
export const BUILD = typeof __BUILD_ID__ === 'undefined' ? 'development' : __BUILD_ID__
export const SOURCE = typeof __SOURCE_SHA__ === 'undefined' ? 'development' : __SOURCE_SHA__
export const GENERATION = `jumpit-${BUILD}`
