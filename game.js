export function createGame(canvas) {
  const context = canvas.getContext('2d')
  let running = false

  function resize() {
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(bounds.width * ratio))
    canvas.height = Math.max(1, Math.round(bounds.height * ratio))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    paint(bounds.width, bounds.height)
  }

  function paint(width, height) {
    context.clearRect(0, 0, width, height)
    const sky = context.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#7BD7E7')
    sky.addColorStop(1, '#E6F4C7')
    context.fillStyle = sky
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#3B7A57'
    context.fillRect(0, height * 0.76, width, height * 0.24)
    context.fillStyle = '#214C45'
    context.font = '700 18px ui-rounded, system-ui, sans-serif'
    context.textAlign = 'center'
    context.fillText('the trail is waking up', width / 2, height / 2)
  }

  return {
    start() {
      running = true
      resize()
    },
    stop() {
      running = false
    },
    resize() {
      if (running) resize()
    },
  }
}
