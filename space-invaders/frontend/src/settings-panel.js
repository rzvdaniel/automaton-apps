import { getSettingsMenuLayout } from './overlay-layout.js'

const SETTINGS_ITEMS = [
  {
    id: 'spriteStyle',
    label: 'Sprite Style',
    options: [
      { value: 'pixel-gaps', label: 'Pixel Gaps' },
      { value: 'smooth', label: 'Smooth' }
    ]
  },
  {
    id: 'screenShake',
    label: 'Screen Shake',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' }
    ]
  },
  {
    id: 'backgroundBlur',
    label: 'Background Blur',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' }
    ]
  },
  {
    id: 'controls',
    label: 'Controls',
    options: [
      { value: 'buttons', label: 'Buttons' },
      { value: 'zones', label: 'Touch Zones' }
    ]
  },
  {
    id: 'sound',
    label: 'Sound',
    options: [
      { value: true, label: 'On' },
      { value: false, label: 'Off' }
    ]
  },
  {
    id: 'reducedMotion',
    label: 'Reduced Motion',
    options: [
      { value: false, label: 'Off' },
      { value: true, label: 'On' }
    ]
  },
  {
    id: 'keyboardHint',
    label: 'Keyboard Hint',
    options: [
      { value: true, label: 'On' },
      { value: false, label: 'Off' }
    ]
  }
]

function clampIndex(index) {
  return (index + SETTINGS_ITEMS.length + 1) % (SETTINGS_ITEMS.length + 1)
}

function isInsideRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

function cycleOption(options, currentValue, direction) {
  const currentIndex = options.findIndex((option) => option.value === currentValue)
  const nextIndex = (currentIndex + direction + options.length) % options.length
  return options[nextIndex].value
}

export function setupSettingsPanel({ game, root, shell }) {
  const canvas = root.querySelector('.game')
  const openButton = root.querySelector('.settings-button')
  let selectedIndex = 0

  function isOpen() {
    return game.isSettingsOpen()
  }

  function getItemValue(item, settings) {
    if (item.id === 'sound') return !game.isMuted()
    return settings[item.id]
  }

  function updateRenderState() {
    const settings = game.getSettings()
    shell.dataset.controlsMode = settings.controls
    game.setSettingsMenuState({
      selectedIndex,
      closeLabel: shell.dataset.gameStarted === 'true' ? 'Resume' : 'Back',
      footerLabel: shell.dataset.gameStarted === 'true' ? 'ARROWS MOVE  ENTER CHANGE  ESC RESUME' : 'ARROWS MOVE  ENTER CHANGE  ESC CLOSE',
      items: SETTINGS_ITEMS.map((item) => {
        const value = getItemValue(item, settings)
        const option = item.options.find((entry) => entry.value === value) ?? item.options[0]
        return {
          id: item.id,
          label: item.label,
          value,
          valueLabel: option.label
        }
      })
    })
  }

  function applyValue(item, value) {
    if (item.id === 'sound') {
      game.setMuted(!value)
    } else {
      game.updateSettings({ [item.id]: value })
    }
    updateRenderState()
  }

  function changeSelectedItem(direction) {
    if (selectedIndex === SETTINGS_ITEMS.length) return
    const settings = game.getSettings()
    const item = SETTINGS_ITEMS[selectedIndex]
    const value = getItemValue(item, settings)
    applyValue(item, cycleOption(item.options, value, direction))
  }

  function activateSelectedItem() {
    if (selectedIndex === SETTINGS_ITEMS.length) {
      closeDialog(true)
      return
    }
    changeSelectedItem(1)
  }

  function moveSelection(direction) {
    selectedIndex = clampIndex(selectedIndex + direction)
    updateRenderState()
  }

  function getWorldPoint(event) {
    const rect = canvas.getBoundingClientRect()
    const { scale, offsetX, offsetY } = game.getViewport()
    return {
      x: (event.clientX - rect.left - offsetX) / scale,
      y: (event.clientY - rect.top - offsetY) / scale
    }
  }

  function handlePointer(event) {
    if (!isOpen()) return
    const { desktopMode } = game.getViewport()
    const layout = getSettingsMenuLayout(desktopMode, SETTINGS_ITEMS.length)
    const point = getWorldPoint(event)
    event.preventDefault()
    event.stopImmediatePropagation()

    if (!isInsideRect(point.x, point.y, layout.panel)) {
      closeDialog(true)
      return
    }

    if (isInsideRect(point.x, point.y, layout.closeButton)) {
      selectedIndex = SETTINGS_ITEMS.length
      updateRenderState()
      closeDialog(true)
      return
    }

    const rowIndex = layout.rows.findIndex((row) => isInsideRect(point.x, point.y, row))
    if (rowIndex === -1) return

    selectedIndex = rowIndex
    const item = SETTINGS_ITEMS[rowIndex]
    if (item.options.length === 2) {
      const nextValue = point.x >= layout.rows[rowIndex].x + layout.rows[rowIndex].width * 0.5
        ? item.options[0].value
        : item.options[1].value
      applyValue(item, nextValue)
      return
    }

    const direction = point.x >= layout.rows[rowIndex].x + layout.rows[rowIndex].width * 0.7 ? 1 : point.x <= layout.rows[rowIndex].x + layout.rows[rowIndex].width * 0.42 ? -1 : 1
    changeSelectedItem(direction)
  }

  function handleKeyDown(event) {
    if (!isOpen()) return
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Enter', 'Space', 'Escape'].includes(event.code)) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()

    if (event.code === 'ArrowUp' || event.code === 'KeyW') moveSelection(-1)
    if (event.code === 'ArrowDown' || event.code === 'KeyS') moveSelection(1)
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') changeSelectedItem(-1)
    if (event.code === 'ArrowRight' || event.code === 'KeyD') changeSelectedItem(1)
    if (event.code === 'Enter' || event.code === 'Space') activateSelectedItem()
    if (event.code === 'Escape') closeDialog(true)
  }

  function openDialog() {
    if (isOpen()) return
    if (shell.dataset.gameStarted === 'true') game.setPaused(true)
    updateRenderState()
  }

  function closeDialog(resume = true) {
    if (!isOpen()) return
    game.setSettingsMenuState(null)
    if (resume && shell.dataset.gameStarted === 'true') game.setPaused(false)
  }

  openButton.addEventListener('click', () => {
    if (isOpen()) {
      closeDialog(true)
      return
    }
    openDialog()
  })
  canvas.addEventListener('pointerdown', handlePointer)
  window.addEventListener('keydown', handleKeyDown, true)

  game.setSettingsMenuState(null)
  shell.dataset.settingsOpen = 'false'

  return {
    open: openDialog,
    close: closeDialog
  }
}
