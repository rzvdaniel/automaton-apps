import { STORAGE_KEYS } from './config.js'

export const DEFAULT_SETTINGS = {
  spriteStyle: 'pixel-gaps',
  screenShake: 'low',
  backgroundBlur: 'low',
  reducedMotion: false,
  keyboardHint: true
}

function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings)
    const defaults = getDefaultSettings()
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return getDefaultSettings()
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
}
