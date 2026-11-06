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

function cycleOption(options, currentValue, direction) {
  const currentIndex = options.findIndex((option) => option.value === currentValue)
  const nextIndex = (currentIndex + direction + options.length) % options.length
  return options[nextIndex].value
}

export function setupSettingsPanel({ game, root, shell }) {
  const openButton = root.querySelector('.settings-button')
  const settingsMenu = root.querySelector('.settings-menu')
  const titleElement = root.querySelector('.settings-title')
  const subtitleElement = root.querySelector('.settings-subtitle')
  const listElement = root.querySelector('.settings-list')
  const backButton = root.querySelector('.settings-back')
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

  function applyValue(item, value) {
    if (item.id === 'sound') {
      game.setMuted(!value)
    } else {
      game.updateSettings({ [item.id]: value })
    }
    renderSettingsDialog()
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
    renderSettingsDialog()
  }

  function activateSelectedItem() {
    const entries = getCurrentEntries()
    if (selectedIndex === entries.length) {
      if (screen === 'detail') {
        resetToMainScreen()
        renderSettingsDialog()
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
    renderSettingsDialog()
  }

  function renderSettingsDialog() {
    const settings = game.getSettings()
    const activeSection = getActiveSection()
    const entries = getCurrentEntries()
    const isMain = screen === 'main'

    titleElement.textContent = activeSection?.label ?? 'Settings'
    subtitleElement.textContent = isMain ? 'System Menu' : 'Adjust Option'
    backButton.textContent = isMain ? 'Close' : 'Back'
    settingsMenu.setAttribute('aria-hidden', isOpen() ? 'false' : 'true')
    listElement.innerHTML = ''

    entries.forEach((entry, index) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'settings-row'
      row.dataset.selected = selectedIndex === index ? 'true' : 'false'

      const label = document.createElement('span')
      label.className = 'settings-row-label'
      label.textContent = entry.label
      row.append(label)

      const value = document.createElement('span')
      value.className = 'settings-row-value'

      if (isMain) {
        value.textContent = entry.summary(settings, game.isMuted())
        row.addEventListener('click', () => openSection(entry.id))
      } else {
        const option = getOption(entry, settings)
        value.textContent = option.label
        row.addEventListener('click', () => {
          selectedIndex = index
          changeSelectedItem(1)
        })
      }

      row.append(value)
      listElement.append(row)
    })
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
        renderSettingsDialog()
      } else {
        closeDialog(true)
      }
    }
  }

  function openDialog() {
    if (isOpen()) return
    resetToMainScreen()
    if (shell.dataset.gameStarted === 'true') game.setPaused(true)
    game.setSettingsMenuState({ view: 'html' })
    renderSettingsDialog()
  }

  function closeDialog(resume = true) {
    if (!isOpen()) return
    game.setSettingsMenuState(null)
    settingsMenu.setAttribute('aria-hidden', 'true')
    if (resume && shell.dataset.gameStarted === 'true') game.setPaused(false)
  }

  openButton.addEventListener('click', () => {
    if (isOpen()) {
      closeDialog(true)
      return
    }
    openDialog()
  })

  backButton.addEventListener('click', () => {
    if (screen === 'detail') {
      resetToMainScreen()
      renderSettingsDialog()
      return
    }
    closeDialog(true)
  })

  window.addEventListener('keydown', handleKeyDown, true)

  game.setSettingsMenuState(null)
  shell.dataset.settingsOpen = 'false'
  settingsMenu.setAttribute('aria-hidden', 'true')

  return {
    open: openDialog,
    close: closeDialog
  }
}
