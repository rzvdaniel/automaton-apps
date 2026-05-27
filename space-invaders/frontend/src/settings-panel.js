import { getSettingsMenuLayout } from './overlay-layout.js'

const SETTING_DEFINITIONS = [
  {
    id: 'spriteStyle',
    label: 'Sprite Style',
    category: 'graphics',
    options: [
      { value: 'pixel-gaps', label: 'Pixel Gaps' },
      { value: 'smooth', label: 'Smooth' }
    ]
  },
  {
    id: 'screenShake',
    label: 'Screen Shake',
    category: 'graphics',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' }
    ]
  },
  {
    id: 'backgroundBlur',
    label: 'Background Blur',
    category: 'graphics',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' }
    ]
  },
  {
    id: 'controls',
    label: 'Controls',
    category: 'controls',
    options: [
      { value: 'buttons', label: 'Buttons' },
      { value: 'zones', label: 'Touch Zones' }
    ]
  },
  {
    id: 'sound',
    label: 'Sound',
    category: 'audio',
    options: [
      { value: true, label: 'On' },
      { value: false, label: 'Off' }
    ]
  },
  {
    id: 'reducedMotion',
    label: 'Reduced Motion',
    category: 'accessibility',
    options: [
      { value: false, label: 'Off' },
      { value: true, label: 'On' }
    ]
  },
  {
    id: 'keyboardHint',
    label: 'Keyboard Hint',
    category: 'accessibility',
    options: [
      { value: true, label: 'On' },
      { value: false, label: 'Off' }
    ]
  }
]

const SETTINGS_SECTIONS = [
  {
    id: 'graphics',
    label: 'Graphics',
    summary(settings) {
      return settings.spriteStyle === 'smooth' ? 'Smooth holographics' : 'Crisp pixel glow'
    }
  },
  {
    id: 'controls',
    label: 'Controls',
    summary(settings) {
      return settings.controls === 'zones' ? 'Touch zones engaged' : 'Button layout engaged'
    }
  },
  {
    id: 'audio',
    label: 'Audio',
    summary(_settings, isMuted) {
      return isMuted ? 'Sound muted' : 'Sound live'
    }
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    summary(settings) {
      return settings.reducedMotion ? 'Reduced motion active' : 'Full motion active'
    }
  }
]

function wrapIndex(index, length) {
  return (index + length + 1) % (length + 1)
}

function isInsideRect(x, y, rect, slop = 0) {
  return (
    x >= rect.x - slop &&
    x <= rect.x + rect.width + slop &&
    y >= rect.y - slop &&
    y <= rect.y + rect.height + slop
  )
}

function cycleOption(options, currentValue, direction) {
  const currentIndex = options.findIndex((option) => option.value === currentValue)
  const nextIndex = (currentIndex + direction + options.length) % options.length
  return options[nextIndex].value
}

export function setupSettingsPanel({ game, root, shell }) {
  const canvas = root.querySelector('.game')
  const openButton = root.querySelector('.settings-button')
  let screen = 'main'
  let activeSectionId = null
  let selectedIndex = 0

  function isOpen() {
    return game.isSettingsOpen()
  }

  function getActiveSection() {
    return SETTINGS_SECTIONS.find((section) => section.id === activeSectionId) ?? null
  }

  function getSectionItems(sectionId) {
    return SETTING_DEFINITIONS.filter((item) => item.category === sectionId)
  }

  function getCurrentEntries() {
    if (screen === 'main') return SETTINGS_SECTIONS
    return getSectionItems(activeSectionId)
  }

  function getItemValue(item, settings) {
    if (item.id === 'sound') return !game.isMuted()
    return settings[item.id]
  }

  function getOption(item, settings) {
    const value = getItemValue(item, settings)
    return item.options.find((entry) => entry.value === value) ?? item.options[0]
  }

  function resetToMainScreen() {
    screen = 'main'
    activeSectionId = null
    selectedIndex = 0
  }

  function updateRenderState() {
    const settings = game.getSettings()
    const activeSection = getActiveSection()
    const { desktopMode } = game.getViewport()
    const entries = screen === 'main'
      ? SETTINGS_SECTIONS.map((section) => ({
          kind: 'section',
          id: section.id,
          label: section.label,
          valueLabel: section.summary(settings, game.isMuted())
        }))
      : getSectionItems(activeSectionId).map((item) => {
          const option = getOption(item, settings)
          return {
            kind: 'item',
            id: item.id,
            label: item.label,
            value: option.value,
            valueLabel: option.label
          }
        })

    game.setSettingsMenuState({
      view: screen,
      selectedIndex,
      title: activeSection?.label ?? 'Settings',
      subtitle: activeSection?.caption ?? 'System Menu',
      closeLabel: screen === 'main' ? (shell.dataset.gameStarted === 'true' ? 'Resume' : 'Back') : 'Main Menu',
      footerLabel: screen === 'main'
        ? (desktopMode ? 'UP/DOWN SELECT   ENTER OPEN   ESC CLOSE' : 'TAP TO SELECT')
        : (desktopMode ? 'LEFT/RIGHT CHANGE   ESC BACK' : 'TAP LEFT/RIGHT TO CHANGE'),
      items: entries
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
    if (screen === 'main') return
    const entries = getCurrentEntries()
    if (selectedIndex === entries.length) return
    const settings = game.getSettings()
    const item = entries[selectedIndex]
    const value = getItemValue(item, settings)
    applyValue(item, cycleOption(item.options, value, direction))
  }

  function openSection(sectionId) {
    activeSectionId = sectionId
    screen = 'detail'
    selectedIndex = 0
    updateRenderState()
  }

  function activateSelectedItem() {
    const entries = getCurrentEntries()
    if (selectedIndex === entries.length) {
      if (screen === 'detail') {
        resetToMainScreen()
        updateRenderState()
        return
      }
      closeDialog(true)
      return
    }

    if (screen === 'main') {
      openSection(entries[selectedIndex].id)
      return
    }

    changeSelectedItem(1)
  }

  function moveSelection(direction) {
    selectedIndex = wrapIndex(selectedIndex + direction, getCurrentEntries().length)
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
    const entries = getCurrentEntries()
    const layout = getSettingsMenuLayout(desktopMode, entries.length, screen)
    const point = getWorldPoint(event)
    const touchSlop = desktopMode ? 0 : 28
    event.preventDefault()
    event.stopImmediatePropagation()

    if (!isInsideRect(point.x, point.y, layout.panel, touchSlop)) {
      closeDialog(true)
      return
    }

    if (isInsideRect(point.x, point.y, layout.closeButton, touchSlop)) {
      selectedIndex = entries.length
      if (screen === 'detail') {
        resetToMainScreen()
        updateRenderState()
      } else {
        updateRenderState()
        closeDialog(true)
      }
      return
    }

    const rowIndex = layout.rows.findIndex((row) => isInsideRect(point.x, point.y, row, touchSlop))
    if (rowIndex === -1) return

    selectedIndex = rowIndex
    if (screen === 'main') {
      openSection(entries[rowIndex].id)
      return
    }

    const item = entries[rowIndex]
    const row = layout.rows[rowIndex]
    const relativeX = (point.x - row.x) / row.width

    if (relativeX < 0.5) {
      changeSelectedItem(-1)
      return
    }

    changeSelectedItem(1)
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
    if ((event.code === 'ArrowLeft' || event.code === 'KeyA') && screen === 'detail') changeSelectedItem(-1)
    if ((event.code === 'ArrowRight' || event.code === 'KeyD') && screen === 'detail') changeSelectedItem(1)
    if (event.code === 'Enter' || event.code === 'Space') activateSelectedItem()
    if (event.code === 'Escape') {
      if (screen === 'detail') {
        resetToMainScreen()
        updateRenderState()
      } else {
        closeDialog(true)
      }
    }
  }

  function openDialog() {
    if (isOpen()) return
    resetToMainScreen()
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
