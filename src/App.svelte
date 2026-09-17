<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { currentSeed, isDaily, shareSeed } from './seed.ts'
  import { createAudio, type Audio } from './audio.ts'
  import { challengeWon, dailyChallenge, type DailyChallenge } from './daily.ts'
  import { createGame, type Game, type GameAction, type GameCue, type GameState } from './game.ts'
  import { wireInstall } from './install.ts'
  import { LEVELS, REGIONS, type RegionId } from './levels.ts'
  import { createRelease } from './release.ts'
  import { createSaveStore, freshSave, hasGoldBell, type Save, type Theme } from './save.ts'
  import { wireUpdate, registerWorker } from './update.ts'
  import { VERSION } from './version.ts'

  let { gameFactory = createGame, audioFactory = createAudio }: {
    gameFactory?: typeof createGame
    audioFactory?: typeof createAudio
  } = $props()

  type Tab = 'play' | 'trails' | 'looks' | 'more'
  type Challenge = DailyChallenge & { seed: number; daily: boolean }
  type Howto = { title: string; steps: string[]; copy: string }
  const HOW_TO_PLAY: Howto = {
    title: 'How to play',
    steps: ['Touch the left side, then slide to run.', 'Tap the right side to jump.', 'Gather lantern seeds and reach the bell.'],
    copy: 'Slide left to run. Tap anywhere on the right side to jump.',
  }
  const release = createRelease(LEVELS, 20)
  const releaseLevels = release.levels
  const hiddenLights = releaseLevels.flatMap(level => level.objects
    .filter(([, kind]) => kind === 'hidden-light').map(([id]) => ({ id, region: level.region })))
  const hiddenLightByRegion = new Map(hiddenLights.map(light => [light.region, light.id]))
  const activeSeed = currentSeed()
  const featuredChallenge: Challenge = { ...dailyChallenge(activeSeed), seed: activeSeed, daily: isDaily(activeSeed) }
  const looks: { id: Theme; label: string; description: string; goal?: string; unlocked: (gameState: Save) => boolean }[] = [
    { id: 'garden', label: 'Garden', description: 'bright + leafy', unlocked: () => true },
    { id: 'dusk', label: 'Dusk', description: 'gold + moonlit', unlocked: () => true },
    { id: 'rain', label: 'Rain', description: 'cool + cloudlit', goal: 'clear Rooftop Rain', unlocked: gameState => gameState.completed.includes('rooftop-4') },
    { id: 'lantern', label: 'Lantern', description: 'warm + glowing', goal: 'clear Lantern Market', unlocked: gameState => gameState.completed.includes('market-4') },
  ]
  const tabs: { id: Tab; symbol: string; label: string }[] = [
    { id: 'play', symbol: '⌂', label: 'HOME' }, { id: 'trails', symbol: '⌁', label: 'TRAILS' },
    { id: 'looks', symbol: '✦', label: 'LOOKS' }, { id: 'more', symbol: '•••', label: 'MORE' },
  ]
  const actions: GameAction[] = ['left', 'right', 'jump']
  let save = $state(freshSave())
  const store = createSaveStore({ onChange: next => { save = next } })
  save = store.get()
  let screen = $state<'menu' | 'game'>('menu')
  let tab = $state<Tab>(new URLSearchParams(location.search).has('seed') ? 'more' : 'play')
  let orientationBlocked = $state(false)
  let resetArmed = $state(false)
  let howtoContent = $state<Howto>(HOW_TO_PLAY)
  let shareLabel = $state('SHARE WITH A FRIEND')
  let queuedNext = $state<string | null>(null)
  let activeChallenge: Challenge | null = null
  let lastCompleted: string | null = null
  let overlayOpen = false
  let pendingPlay: { levelId: string } | null = null
  let pendingAudio: Promise<boolean> | null = null
  let pendingNeedsResume = false
  let gameStarted = false
  let playGeneration = 0
  let alive = false
  let game: Game | undefined
  let audio: Audio | undefined
  let canvas!: HTMLCanvasElement
  let menu!: HTMLElement
  let howto!: HTMLDialogElement
  let about!: HTMLDialogElement
  let rotateDevice!: HTMLDialogElement
  let rotateTitle!: HTMLHeadingElement
  let rotateHome!: HTMLButtonElement
  let playButton!: HTMLButtonElement
  let pauseButton!: HTMLButtonElement
  let resumeButton!: HTMLButtonElement
  let nextButton!: HTMLButtonElement
  let restartButton!: HTMLButtonElement
  let endingHome!: HTMLButtonElement
  let installButton!: HTMLButtonElement
  let updateButton!: HTMLButtonElement
  let directionZone!: HTMLDivElement
  let gameStatus!: HTMLParagraphElement
  let gameState = $state<GameState>({ levelId: 'garden-1', levelName: 'GARDEN WALK', regionName: '', seeds: 0,
    maxSeeds: 3, paused: false, finished: false, respawning: false, message: '', hiddenLightId: null,
    guardianHealth: 0, guardianMax: 0, guardianDefeated: false })
  let statusRevision = $state(0)
  let overlay = $state({ campaign: false, kicker: 'TAKE A BREATH', title: 'PAUSED',
    copy: 'The trail waits for you.', restart: 'START OVER' })
  let coach = $state(false)
  let held = $state<Record<GameAction, boolean>>({ left: false, right: false, jump: false })
  const activeInputs = new Map<GameAction, Set<string>>()
  const releaseTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const shareTimers = new Set<ReturnType<typeof setTimeout>>()
  const frames = new Set<number>()
  let stickPointer = $state<number | null>(null)
  let stickSource = ''
  let stickOriginX = 0
  let stickAction = $state<'left' | 'right' | null>(null)
  let stickX = $state(0)
  let stickY = $state(0)
  let stickDx = $state(0)
  let touchX = $state(0)
  let touchY = $state(0)
  const selectedLook = $derived(looks.find(look => look.id === save.theme)?.unlocked(save) ? save.theme : 'garden')
  const selected = $derived(release.find(release.playable(save.selectedLevel, save.unlocked)) || releaseLevels[0])
  const selectedMax = $derived(selected.objects.filter(([, kind]) => kind === 'seed').length)
  const selectedGold = $derived(hasGoldBell(save, selected.id))
  const goldBellCount = $derived(releaseLevels.filter(level => hasGoldBell(save, level.id)).length)
  const campaignComplete = $derived(save.completed.includes('keep-4'))
  const foundLights = $derived(new Set(save.hiddenLights))
  const dailyWon = $derived(save.dailyWins.includes(activeSeed))
  const dailyLocked = $derived(!save.unlocked.includes(featuredChallenge.levelId))
  const dailyGate = releaseLevels[releaseLevels.findIndex(level => level.id === featuredChallenge.levelId) - 1]
  const overlayVisible = $derived(gameState.paused || gameState.finished)
  const guardianActive = $derived(Number.isFinite(gameState.guardianMax) && gameState.guardianMax > 0)
  $effect(() => { document.documentElement.dataset.theme = selectedLook })
  $effect(() => {
    // Keep the live region mounted; only restart its animation after text updates.
    void statusRevision
    gameStatus.classList.remove('status-pop')
    if (gameState.message) {
      void gameStatus.offsetWidth
      gameStatus.classList.add('status-pop')
    }
  })

  function lightFound(region: RegionId) {
    const id = hiddenLightByRegion.get(region)
    return id !== undefined && foundLights.has(id)
  }
  function afterRender(callback: () => void) {
    void tick().then(() => { if (alive) callback() })
  }
  function nextFrame(callback: () => void) {
    const frame = requestAnimationFrame(() => {
      frames.delete(frame)
      if (alive) callback()
    })
    frames.add(frame)
  }
  function focusPause() {
    afterRender(() => { if (screen === 'game' && !orientationBlocked) pauseButton.focus({ preventScroll: true }) })
  }
  function focusOverlay() {
    if (screen !== 'game' || orientationBlocked || !overlayVisible) return
    const target = gameState.paused ? resumeButton : overlay.campaign ? endingHome : queuedNext ? nextButton : restartButton
    target.focus()
  }
  function completionCopy(nextState: GameState) {
    const current = release.find(nextState.levelId)
    if (!current) return ''
    const region = REGIONS.find(item => item.id === current.region)
    const regionLevels = releaseLevels.filter(level => level.region === current.region)
    const completed = new Set(save.completed)
    completed.add(current.id)
    const lit = regionLevels.filter(level => completed.has(level.id)).length
    let copy = `${region?.name || current.region}: ${lit} OF ${regionLevels.length} TRAILS LIT.`
    const next = release.find(release.next(current.id))
    if (next && !save.unlocked.includes(next.id)) {
      const nextRegion = REGIONS.find(item => item.id === next.region)
      copy += ` ${next.region === current.region ? next.name : nextRegion?.name || next.region} IS NOW OPEN.`
    }
    return copy.toUpperCase()
  }
  function receiveState(next: GameState) {
    if (!alive) return
    audio?.setMusicPlaying(!next.paused && !next.finished)
    if (next.hiddenLightId) store.findHiddenLight(next.hiddenLightId)
    const challenge = activeChallenge
    const challengeFinished = Boolean(challenge && next.finished)
    const campaign = !challenge && next.finished && next.levelId === 'keep-4'
    const gold = !challenge && next.finished && next.maxSeeds > 0 && next.seeds === next.maxSeeds
    const found = new Set(save.hiddenLights)
    const hiddenEnding = found.size === hiddenLights.length ? ' EVERY HIDDEN LIGHT JOINS THE BEACON.'
      : found.size ? ' THE HIDDEN LIGHTS YOU FOUND TWINKLE TOO.' : ''
    const stamped = Boolean(challengeFinished && challenge && challengeWon(challenge, next))
    if (next.respawning && !gameState.respawning) releaseAllInputs()
    gameState = next
    statusRevision += 1
    overlay = {
      campaign,
      kicker: challengeFinished && challenge ? challenge.daily ? "TODAY'S CHALLENGE" : 'FRIEND CHALLENGE'
        : campaign ? 'THE LIGHT IS HOME' : next.finished ? next.regionName.toUpperCase() : 'TAKE A BREATH',
      title: challengeFinished ? stamped ? 'STAMP EARNED!' : 'MORE LIGHT NEEDED'
        : campaign ? 'THE GARDEN GLOWS!' : gold ? 'GOLD BELL!' : next.finished ? 'TRAIL CLEARED!' : 'PAUSED',
      copy: challengeFinished && challenge
        ? stamped ? `${challenge.goalSeeds} SEEDS + BELL · STAMP EARNED` : `FOUND ${next.seeds}/${challenge.goalSeeds} SEEDS · TRY AGAIN`
        : campaign ? `${gold ? 'GOLD BELL EARNED! ' : ''}${completionCopy(next)} YOU LIT THE BEACON. ALL FIVE PLACES GLOW AGAIN.${hiddenEnding}`
          : next.finished ? completionCopy(next) : 'The trail waits for you.',
      restart: campaign ? 'PLAY THE KEEP AGAIN' : next.finished ? challengeFinished && !stamped ? 'TRY AGAIN' : 'RUN IT AGAIN' : 'START OVER',
    }
    if ((next.paused || next.finished) && !overlayOpen) {
      overlayOpen = true
      afterRender(focusOverlay)
    } else if (!next.paused && !next.finished) overlayOpen = false
    if (challengeFinished && challenge) {
      queuedNext = null
      const stampId = `challenge-${challenge.seed}`
      if (stamped && lastCompleted !== stampId) {
        lastCompleted = stampId
        store.completeDaily(challenge.seed)
      }
    } else if (next.finished && lastCompleted !== next.levelId) {
      lastCompleted = next.levelId
      queuedNext = release.next(next.levelId)
      store.completeLevel(next.levelId, next.seeds, queuedNext)
    }
  }
  function receiveCue(cue: GameCue) {
    if (!alive) return
    if (cue === 'controls-learned') { store.learnControls(); coach = false; return }
    audio?.cue(cue)
    const pulse = cue === 'guardian-defeated' ? [35, 25, 35, 25, 80]
      : cue === 'finish' ? [35, 35, 60] : cue === 'hidden-light' ? [18, 24, 18, 24, 80]
        : cue === 'guardian-hit' ? [24, 24, 34] : ['seed', 'stomp', 'checkpoint', 'guardian-locked'].includes(cue) ? 24 : 0
    if (pulse) navigator.vibrate?.(pulse)
  }
  function pressInput(action: GameAction, source: string) {
    clearTimeout(releaseTimers.get(source))
    releaseTimers.delete(source)
    const sources = activeInputs.get(action) || new Set<string>()
    if (sources.has(source)) return
    const first = sources.size === 0
    sources.add(source)
    activeInputs.set(action, sources)
    held[action] = true
    if (first) game?.setInput(action, true, `touch:${action}`)
  }
  function releaseInput(action: GameAction, source: string) {
    clearTimeout(releaseTimers.get(source))
    releaseTimers.delete(source)
    const sources = activeInputs.get(action)
    if (!sources?.delete(source) || sources.size) return
    activeInputs.delete(action)
    held[action] = false
    game?.setInput(action, false, `touch:${action}`)
  }
  function releaseAllInputs() {
    for (const timer of releaseTimers.values()) clearTimeout(timer)
    for (const action of actions) { held[action] = false; game?.setInput(action, false) }
    releaseTimers.clear()
    activeInputs.clear()
    stickPointer = null
    stickSource = ''
    stickAction = null
    stickDx = 0
    game?.clearInput()
  }
  function beginPendingPlay() {
    if (!pendingPlay || orientationBlocked || !game) return false
    const next = pendingPlay
    const startPaused = pendingNeedsResume
    const generation = playGeneration
    pendingPlay = null
    pendingNeedsResume = false
    gameStarted = true
    coach = !store.get().controlsLearned
    game.start(next.levelId, { foundHiddenLights: store.get().hiddenLights })
    if (startPaused) game.pause()
    void Promise.resolve(pendingAudio).then(ready => {
      if (alive && generation === playGeneration && screen === 'game' && ready) audio?.cue('start')
    })
    pendingAudio = null
    focusPause()
    return true
  }
  function syncOrientation() {
    const blocked = innerHeight > innerWidth
    const wasBlocked = orientationBlocked
    orientationBlocked = blocked
    document.body.classList.toggle('orientation-blocked', blocked)
    if (blocked) {
      for (const dialog of [howto, about]) if (dialog.open) dialog.close()
      releaseAllInputs()
      if (!wasBlocked && screen === 'game' && gameStarted) game?.pause()
      afterRender(() => {
        if (!orientationBlocked) return
        if (!rotateDevice.open) rotateDevice.showModal()
        nextFrame(() => { if (orientationBlocked) (screen === 'game' ? rotateHome : rotateTitle).focus({ preventScroll: true }) })
      })
      return
    }
    if (wasBlocked && about.open) about.close()
    if (rotateDevice.open) rotateDevice.close()
    afterRender(() => {
      if (orientationBlocked) return
      if (screen === 'game') {
        if (!beginPendingPlay()) nextFrame(() => { if (screen === 'game' && !orientationBlocked) game?.resize() })
        if (overlayVisible) nextFrame(focusOverlay)
      } else if (wasBlocked) {
        nextFrame(() => {
          if (screen !== 'menu' || orientationBlocked) return
          const panel = menu.querySelector<HTMLElement>('.tab-panel:not([hidden])')
          ;(panel?.querySelector<HTMLButtonElement>('button:not(:disabled)') || playButton).focus({ preventScroll: true })
        })
      }
    })
  }
  function pauseForInterruption() {
    releaseAllInputs()
    void audio?.suspend()
    if (screen !== 'game') return
    if (pendingPlay) { pendingNeedsResume = true; pendingAudio = null; return }
    game?.pause()
  }
  function openTab(name: Tab) { tab = name; store.disarmReset(); resetArmed = false }
  function goHome() {
    releaseAllInputs()
    audio?.setMusicPlaying(false)
    game?.stop()
    playGeneration += 1
    pendingPlay = null
    pendingAudio = null
    pendingNeedsResume = false
    gameStarted = false
    activeChallenge = null
    screen = 'menu'
    openTab('play')
    syncOrientation()
    afterRender(() => { if (screen === 'menu' && !orientationBlocked) playButton.focus({ preventScroll: true }) })
  }
  function playLevel(preferred: string | null = store.get().selectedLevel, challenge: Challenge | null = null) {
    const levelId = challenge ? !store.get().unlocked.includes(challenge.levelId) ? null : release.find(challenge.levelId)?.id
      : release.playable(preferred, store.get().unlocked)
    if (!levelId || !audio) return
    const level = release.find(levelId)
    if (!level) return
    // Create/resume audio in this trusted gesture, before Svelte's DOM flush.
    pendingAudio = audio.startFromGesture()
    playGeneration += 1
    activeChallenge = challenge
    if (!challenge) store.selectLevel(levelId)
    queuedNext = null
    lastCompleted = null
    pendingPlay = { levelId }
    pendingNeedsResume = false
    gameStarted = false
    gameState = { ...gameState, levelName: level.name, seeds: 0,
      maxSeeds: level.objects.filter(([, kind]) => kind === 'seed').length, paused: false }
    screen = 'game'
    syncOrientation()
  }
  function pressButton(event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }, action: GameAction) {
    event.preventDefault()
    const button = event.currentTarget
    if (action === 'jump') {
      const bounds = button.getBoundingClientRect()
      touchX = event.clientX - bounds.left
      touchY = event.clientY - bounds.top
    }
    try { button.setPointerCapture(event.pointerId) } catch {}
    pressInput(action, `${button.id}:pointer:${event.pointerId}`)
  }
  function releaseButton(event: PointerEvent, action: GameAction, id: string) {
    const source = `${id}:pointer:${event.pointerId}`
    if (!activeInputs.get(action)?.has(source)) return
    event.preventDefault()
    releaseInput(action, source)
  }
  function activateButton(event: MouseEvent, action: GameAction, id: string) {
    if (event.detail !== 0) return
    const source = `${id}:activation`
    pressInput(action, source)
    releaseTimers.set(source, setTimeout(() => releaseInput(action, source), 120))
  }
  function controlKey(event: KeyboardEvent) {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
  }
  function setStickAction(action: 'left' | 'right' | null) {
    if (action === stickAction) return
    if (stickAction) releaseInput(stickAction, stickSource)
    stickAction = action
    if (action) pressInput(action, stickSource)
  }
  function startStick(event: PointerEvent) {
    if (event.button > 0 || (event.target instanceof Element && event.target.closest('button')) || stickPointer !== null || !gameStarted || orientationBlocked || overlayVisible) return
    event.preventDefault()
    stickPointer = event.pointerId
    stickSource = `stick:pointer:${event.pointerId}`
    stickOriginX = event.clientX
    const bounds = directionZone.getBoundingClientRect()
    stickX = event.clientX - bounds.left
    stickY = event.clientY - bounds.top
    stickDx = 0
    try { directionZone.setPointerCapture(event.pointerId) } catch {}
  }
  function moveStick(event: PointerEvent) {
    if (event.pointerId !== stickPointer) return
    event.preventDefault()
    const dx = event.clientX - stickOriginX
    const action = stickAction === 'right' && dx > 8 ? 'right' : stickAction === 'left' && dx < -8 ? 'left'
      : dx > 14 ? 'right' : dx < -14 ? 'left' : null
    stickDx = Math.max(-42, Math.min(42, dx))
    setStickAction(action)
  }
  function releaseStick(event: PointerEvent) {
    if (event.pointerId !== stickPointer) return
    event.preventDefault()
    setStickAction(null)
    stickPointer = null
    stickSource = ''
    stickDx = 0
  }
  function rotateKey(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const targets = [...rotateDevice.querySelectorAll<HTMLButtonElement>('button:not([hidden]):not(:disabled)')]
    if (!targets.length) return
    const current = targets.findIndex(target => target === document.activeElement)
    const next = event.shiftKey ? current <= 0 ? targets.length - 1 : current - 1
      : current < 0 || current === targets.length - 1 ? 0 : current + 1
    event.preventDefault()
    targets[next].focus()
  }
  function showHowto(content: Howto) {
    howtoContent = content
    afterRender(() => { if (!howto.open) howto.showModal() })
  }
  function toggleSound() {
    if (!audio) return
    const muted = audio.setMuted(!audio.isMuted())
    if (!muted) void audio.startFromGesture().then(ready => { if (alive && ready) audio?.cue('start') })
  }
  function resetProgress() {
    if (!store.resetArmed()) { store.requestReset(); resetArmed = true; return }
    store.reset()
    openTab('play')
  }
  async function shareChallenge() {
    const original = shareLabel
    const result = await shareSeed(activeSeed, 'Jumpit')
    if (!alive) return
    if (result === 'copied') shareLabel = 'LINK COPIED'
    if (result === 'failed') shareLabel = 'COULD NOT SHARE'
    if (result === 'copied' || result === 'failed') {
      const timer = setTimeout(() => { shareTimers.delete(timer); if (alive) shareLabel = original }, 2200)
      shareTimers.add(timer)
    }
  }
  onMount(() => {
    alive = true
    audio = audioFactory({ readMuted: () => store.get().muted, writeMuted: value => store.setMuted(value) })
    game = gameFactory(canvas, receiveState, receiveCue)
    const install = wireInstall(installButton, { showIosHint: () => showHowto({ title: 'Add to home screen',
      steps: ['Tap the share button at the bottom of Safari.', 'Scroll down and tap Add to Home Screen.', 'Tap Add. It opens like an app and works offline.'], copy: '' }) })
    const updater = wireUpdate(updateButton)
    const worker = registerWorker('sw.js', updater.reveal)
    const gesture = () => { void audio?.startFromGesture() }
    const visibility = () => { if (document.hidden) pauseForInterruption() }
    const releaseJump = (event: PointerEvent) => releaseButton(event, 'jump', 'jump')
    // Chromium touch adjustment must recognize this half as a native click target.
    const preventDirectionClick = (event: MouseEvent) => event.preventDefault()
    directionZone.addEventListener('click', preventDirectionClick)
    window.addEventListener('resize', syncOrientation)
    window.addEventListener('pagehide', pauseForInterruption)
    window.addEventListener('blur', pauseForInterruption)
    window.addEventListener('pointerup', releaseJump)
    window.addEventListener('pointercancel', releaseJump)
    window.addEventListener('pointerup', releaseStick)
    window.addEventListener('pointercancel', releaseStick)
    document.addEventListener('pointerdown', gesture, { once: true })
    document.addEventListener('visibilitychange', visibility)
    syncOrientation()
    return () => {
      alive = false
      playGeneration += 1
      releaseAllInputs()
      pendingPlay = null
      pendingAudio = null
      for (const timer of shareTimers) clearTimeout(timer)
      for (const frame of frames) cancelAnimationFrame(frame)
      shareTimers.clear()
      frames.clear()
      window.removeEventListener('resize', syncOrientation)
      directionZone.removeEventListener('click', preventDirectionClick)
      window.removeEventListener('pagehide', pauseForInterruption)
      window.removeEventListener('blur', pauseForInterruption)
      window.removeEventListener('pointerup', releaseJump)
      window.removeEventListener('pointercancel', releaseJump)
      window.removeEventListener('pointerup', releaseStick)
      window.removeEventListener('pointercancel', releaseStick)
      document.removeEventListener('pointerdown', gesture)
      document.removeEventListener('visibilitychange', visibility)
      install.dispose()
      updater.dispose()
      worker?.dispose()
      game?.destroy()
      void audio?.dispose()
      for (const dialog of [howto, about, rotateDevice]) if (dialog.open) dialog.close()
      document.body.classList.remove('orientation-blocked')
    }
  })
</script>

<main id="menu" class="screen menu-screen" bind:this={menu} hidden={screen !== 'menu'} inert={orientationBlocked}>
  <header class="menu-header">
    <div class="brand"><img src="icon-192.png" width="72" height="72" alt=""><div><h1>Jumpit</h1><p class="tagline">run the lantern trail</p></div></div>
    <nav class="menu-nav" aria-label="game menu">
      {#each tabs as item (item.id)}
        <button class="nav-item" data-tab={item.id} aria-pressed={tab === item.id} onclick={() => { audio?.cue('tap'); openTab(item.id) }}><span aria-hidden="true">{item.symbol}</span><b>{item.label}</b></button>
      {/each}
    </nav>
  </header>
  <div class="menu-content">
    <section id="play-panel" class="tab-panel" hidden={tab !== 'play'}>
      <div class="trail-hero">
        <p id="hero-kicker" class="hero-kicker">{campaignComplete ? 'THE BEACON IS AWAKE' : 'THE GARDEN NEEDS A LIGHT'}</p>
        <h2 id="hero-title">{campaignComplete ? 'You brought light home.' : 'Run it home.'}</h2>
        <p id="continue-label">{selectedGold ? `${selected.name.toUpperCase()} · 🔔 GOLD BELL` : `${selected.name.toUpperCase()} · ${save.bestSeeds[selected.id] || 0}/${selectedMax} SEEDS`}</p>
        <button id="play" class="big" bind:this={playButton} onclick={() => playLevel()}>{campaignComplete ? 'RUN THE KEEP AGAIN' : 'PLAY THE TRAIL'}</button>
      </div>
      <p class="play-promise">Run. Jump. Find light. Ring the bell.</p>
      <p id="gold-bell-count" class="play-promise">{goldBellCount ? `🔔 ${goldBellCount} OF ${releaseLevels.length} GOLD BELLS` : 'ALL SEEDS + BELL = GOLD BELL'}</p>
      <section id="hidden-lights" class="hidden-lights" aria-label={`Hidden lights found: ${foundLights.size} of ${hiddenLights.length}`} hidden={foundLights.size === 0}>
        <div><b>HIDDEN LIGHTS</b><small id="hidden-light-label">{foundLights.size === hiddenLights.length ? 'ALL FIVE GLOW' : `${foundLights.size} OF ${hiddenLights.length} GLOW`}</small></div>
        <div id="hidden-light-stamps" class="hidden-light-stamps">
          {#each REGIONS as region (region.id)}
            <span class="hidden-light-stamp" class:found={lightFound(region.id)} aria-label={`${region.name}: ${lightFound(region.id) ? 'found' : 'sleeping'}`}>{lightFound(region.id) ? '✦' : '◇'}</span>
          {/each}
        </div>
      </section>
    </section>
    <section id="trails-panel" class="tab-panel" hidden={tab !== 'trails'}>
      <div class="panel-heading"><p id="trail-summary">{releaseLevels.length} TRAILS · {new Set(releaseLevels.map(level => level.region)).size} PLACES</p><h2>Choose a trail</h2></div>
      <div id="trail-list" class="trail-list">
        {#each REGIONS as region, regionIndex (region.id)}
          {@const placeLevels = releaseLevels.filter(level => level.region === region.id)}
          {@const reached = placeLevels.some(level => save.unlocked.includes(level.id) || save.completed.includes(level.id))}
          {#if placeLevels.length}
            {#if !reached}
              <div class="sleeping-place"><span class="sleeping-place-mark" aria-hidden="true">☾</span><span><b>{region.name.toUpperCase()}</b><small>SLEEPING · CLEAR {REGIONS[regionIndex - 1]?.name.toUpperCase() || 'THE PREVIOUS PLACE'} TO WAKE</small></span></div>
            {:else}
              <h3 class="region-divider">{region.name.toUpperCase()}{lightFound(region.id) ? ' · ✦ LIGHT FOUND' : ''}</h3>
              {#each placeLevels as level (level.id)}
                {@const unlocked = save.unlocked.includes(level.id)}
                {@const gold = hasGoldBell(save, level.id)}
                <button class="trail-button" disabled={!unlocked} aria-current={save.selectedLevel === level.id} aria-label={unlocked ? `Play ${level.name}${gold ? ', Gold Bell earned' : ''}` : `${level.name} locked`} onclick={() => playLevel(level.id)}>
                  <span class="trail-number">{gold ? '🔔' : unlocked ? releaseLevels.indexOf(level) + 1 : '×'}</span>
                  <span class="trail-meta"><b>{level.name.toUpperCase()}</b><small>{gold ? 'GOLD BELL EARNED' : save.completed.includes(level.id) ? 'TRAIL CLEARED' : unlocked ? 'READY TO RUN' : 'CLEAR THE TRAIL BEFORE IT'}</small></span>
                  <span class="trail-seeds">{unlocked ? `◆ ${save.bestSeeds[level.id] || 0}/${level.objects.filter(([, kind]) => kind === 'seed').length}` : 'LOCKED'}</span>
                </button>
              {/each}
            {/if}
          {/if}
        {/each}
      </div>
    </section>
    <section id="looks-panel" class="tab-panel" hidden={tab !== 'looks'}>
      <div class="panel-heading"><p>LOOKS</p><h2>Make it yours</h2></div>
      <p class="panel-copy">No shop. No coins. Pick the world that feels best.</p>
      <div class="looks-grid">
        {#each looks as look (look.id)}
          {@const unlocked = look.unlocked(save)}
          <button id={`look-${look.id}`} class="look-card" data-look={look.id} disabled={!unlocked} aria-disabled={!unlocked} aria-pressed={selectedLook === look.id} aria-label={unlocked ? `Use ${look.label} look` : `${look.label} look locked, ${look.goal}`} onclick={() => { if (look.unlocked(store.get())) store.setTheme(look.id) }}>
            <span class={`look-swatch ${look.id}-swatch`} aria-hidden="true"></span><b>{look.label.toUpperCase()}</b><small>{look.description}</small>
            {#if look.goal}<small class="look-status" hidden={unlocked}>LOCKED: {look.goal.toUpperCase()}</small>{/if}
          </button>
        {/each}
      </div>
    </section>
    <section id="more-panel" class="tab-panel" hidden={tab !== 'more'}>
      <div class="panel-heading"><p>MORE</p><h2>Game stuff</h2></div>
      <section id="daily-card" class="daily-card" aria-labelledby="daily-title">
        <div class="daily-copy"><p id="daily-kicker" class="daily-kicker">{featuredChallenge.daily ? "TODAY'S CHALLENGE" : 'FRIEND CHALLENGE'}</p><h3 id="daily-title">{featuredChallenge.title}</h3><p id="daily-copy">{featuredChallenge.copy}</p><p id="daily-status" class="daily-status">{dailyWon ? 'STAMP EARNED' : dailyLocked ? `LOCKED · CLEAR ${dailyGate?.name.toUpperCase() || 'THE TRAIL BEFORE IT'} TO OPEN` : `◆ ${featuredChallenge.goalSeeds} SEEDS + BELL`}</p></div>
        <div class="daily-actions"><button id="daily-play" class="big" disabled={dailyLocked} onclick={() => playLevel(featuredChallenge.levelId, featuredChallenge)}>{dailyWon ? 'PLAY AGAIN' : dailyLocked ? 'TRAIL LOCKED' : 'PLAY CHALLENGE'}</button><button id="friends" class="big secondary" onclick={shareChallenge}>{shareLabel}</button></div>
      </section>
      <button id="howto-open" class="big secondary" onclick={() => showHowto(HOW_TO_PLAY)}>HOW TO PLAY</button>
      <button id="install" class="big secondary" bind:this={installButton} hidden>ADD TO HOME SCREEN</button>
      <button id="about-open" class="big secondary" onclick={() => about.showModal()}>ABOUT</button>
      <button id="sound-toggle" class="big secondary" onclick={toggleSound}>{save.muted ? 'SOUND OFF' : 'SOUND ON'}</button>
      <button id="reset-progress" class="big secondary reset-progress" data-armed={resetArmed ? '' : undefined} onclick={resetProgress}>{resetArmed ? 'TAP AGAIN TO RESET' : 'RESET PROGRESS'}</button>
      <p class="ethos">no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.</p><p id="version" class="version">v{VERSION}</p>
    </section>
  </div>
</main>

<main id="game" class="screen game-screen" hidden={screen !== 'game'} inert={orientationBlocked}>
  <header id="game-bar" class="bar" inert={overlayVisible || orientationBlocked}>
    <button id="back" class="chip" onclick={goHome}>MENU</button><span id="level-name" class="chip flat level-name">{gameState.levelName.toUpperCase()}</span><span id="seed-count" class="chip flat seed-count">◆ {gameState.seeds}/{gameState.maxSeeds}</span>
    <button id="pause" class="chip pause" bind:this={pauseButton} aria-label={gameState.paused ? 'resume game' : 'pause game'} onclick={() => { releaseAllInputs(); game?.togglePause() }}>{gameState.paused ? '▶' : 'Ⅱ'}</button>
  </header>
  <div id="stage-shell" class="stage-shell">
    <canvas id="stage" bind:this={canvas} aria-label="Jumpit game world. Slide on the left to move and tap the right to jump." aria-describedby="game-status"></canvas>
    <p id="game-status" class="game-status" bind:this={gameStatus} role="status" aria-live="polite">{gameState.message}</p>
    <p id="guardian-status" class="guardian-status" role="status" aria-live="polite" aria-atomic="true" hidden={!guardianActive}>{guardianActive ? gameState.guardianDefeated ? 'WARDEN CLEARED · BELL READY' : `WARDEN ${gameState.guardianHealth}/${gameState.guardianMax} · BELL LOCKED` : ''}</p>
    <!-- Preserve the existing overlay landmark; focus moves to its visible action. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <section id="game-overlay" class="game-overlay" class:campaign-ending={overlay.campaign} role="dialog" aria-modal="true" aria-labelledby="overlay-title" aria-describedby="overlay-copy" hidden={!overlayVisible}>
      <div class="game-card">
        <div id="ending-art" class="ending-art" aria-hidden="true" hidden={!overlay.campaign}>{#each hiddenLights as light (light.id)}<span class="ending-light" class:found={foundLights.has(light.id)}></span>{/each}</div>
        <p id="overlay-kicker" class="overlay-kicker">{overlay.kicker}</p><h2 id="overlay-title">{overlay.title}</h2><p id="overlay-copy">{overlay.copy}</p>
        <button id="resume" class="big" bind:this={resumeButton} hidden={!gameState.paused} onclick={() => { void audio?.startFromGesture(); game?.togglePause(); focusPause() }}>KEEP GOING</button>
        <button id="next-trail" class="big" bind:this={nextButton} hidden={!gameState.finished || !queuedNext} onclick={() => playLevel(queuedNext)}>NEXT TRAIL</button>
        <button id="restart" class="big secondary" bind:this={restartButton} onclick={() => { releaseAllInputs(); void audio?.startFromGesture(); game?.restart(); focusPause() }}>{overlay.restart}</button>
        <button id="ending-home" class="big" bind:this={endingHome} hidden={!overlayVisible} onclick={goHome}>HOME</button>
      </div>
    </section>
  </div>
  <div id="controls" class="controls" aria-label="game controls" inert={overlayVisible || orientationBlocked || gameState.respawning} data-coach={coach ? '' : undefined}>
    <!-- The movement gesture surface supplements the two keyboard-accessible buttons. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
    <div id="direction-zone" class="control-zone direction-zone" role="group" aria-label="movement" bind:this={directionZone} data-active={stickPointer !== null ? '' : undefined} data-direction={stickAction || undefined} style:--stick-x={`${stickX}px`} style:--stick-y={`${stickY}px`} style:--stick-dx={`${stickDx}px`} onpointerdown={startStick} onpointermove={moveStick} onpointerup={releaseStick} onpointercancel={releaseStick} onlostpointercapture={releaseStick}>
      <span class="coach-thumb coach-run" aria-hidden="true"></span><span id="move-stick" class="move-stick" aria-hidden="true"></span>
      {#each ['left', 'right'] as direction}
        {@const action = direction as 'left' | 'right'}
        <button id={`move-${action}`} class="control direction" aria-label={`move ${action}`} data-held={held[action] ? '' : undefined} onpointerdown={event => pressButton(event, action)} onpointerup={event => releaseButton(event, action, `move-${action}`)} onpointercancel={event => releaseButton(event, action, `move-${action}`)} onlostpointercapture={event => releaseButton(event, action, `move-${action}`)} onclick={event => activateButton(event, action, `move-${action}`)} onkeydown={controlKey} onkeyup={controlKey}><span aria-hidden="true">{action === 'left' ? '◀' : '▶'}</span></button>
      {/each}
    </div>
    <div id="jump-zone" class="control-zone jump-zone"><span class="coach-thumb coach-jump" aria-hidden="true"></span>
      <button id="jump" class="control jump" aria-label="jump" data-held={held.jump ? '' : undefined} style:--touch-x={`${touchX}px`} style:--touch-y={`${touchY}px`} onpointerdown={event => pressButton(event, 'jump')} onpointerup={event => releaseButton(event, 'jump', 'jump')} onpointercancel={event => releaseButton(event, 'jump', 'jump')} onlostpointercapture={event => releaseButton(event, 'jump', 'jump')} onclick={event => activateButton(event, 'jump', 'jump')} onkeydown={controlKey} onkeyup={controlKey}><span class="jump-feedback" aria-hidden="true">JUMP</span></button>
    </div>
  </div>
</main>

<dialog id="rotate-device" class="rotate-device" bind:this={rotateDevice} aria-labelledby="rotate-title" aria-describedby="rotate-copy" oncancel={event => event.preventDefault()} onkeydown={rotateKey}>
  <div class="rotate-brand"><img src="icon-192.png" width="72" height="72" alt=""><p class="rotate-name">Jumpit</p><p class="rotate-tagline">run the lantern trail</p></div>
  <p id="rotate-kicker" class="rotate-kicker">{screen === 'game' ? 'PAUSED' : 'MORE TRAIL AHEAD'}</p><h2 id="rotate-title" bind:this={rotateTitle} tabindex="-1">Turn your phone sideways</h2><p id="rotate-copy">{screen === 'game' ? 'Your trail is paused. Turn your phone sideways to keep going.' : 'Turn your phone sideways to play. Jumpit plays wide so you can see the next jump.'}</p>
  <button id="rotate-home" class="big secondary" bind:this={rotateHome} hidden={!orientationBlocked || screen !== 'game'} onclick={goHome}>EXIT TO HOME</button><button id="rotate-about" class="chip rotate-about" onclick={() => about.showModal()}>ABOUT</button>
</dialog>
<dialog id="howto" bind:this={howto}><h2>{howtoContent.title}</h2><ol>{#each howtoContent.steps as step}<li>{step}</li>{/each}</ol><p class="small">{howtoContent.copy}</p><button id="howto-close" class="big" onclick={() => howto.close()}>GOT IT</button></dialog>
<dialog id="about" bind:this={about}>
  <h2>About Jumpit</h2><p class="about-body">Jumpit is an original storybook platform game about a small courier carrying light through a living garden.</p><p class="about-ethos">no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.</p>
  <p class="maker-mark">made with <svg aria-hidden="true" class="mark-heart" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span class="sr">love</span> by
    <a href="https://royashbrook.com" target="_blank" rel="noreferrer">roy</a> + <a href="https://royashbrook.com/agents" target="_blank" rel="noreferrer">ai</a><span aria-hidden="true" class="mark-dot">·</span><a href="https://github.com/sponsors/royashbrook" target="_blank" rel="noreferrer" class="mark-sponsor">sponsor me</a>
  </p><button id="about-close" class="big" onclick={() => about.close()}>BACK</button>
</dialog>
<button id="update" class="update" bind:this={updateButton} aria-live="polite" hidden inert={orientationBlocked}>NEW VERSION, TAP TO LOAD</button>
