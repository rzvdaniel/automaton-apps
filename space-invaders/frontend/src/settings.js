import { STORAGE_KEYS } from './config.js'

export const DEFAULT_SETTINGS = {
  spriteStyle: 'pixel-gaps',
  screenShake: 'low',
  backgroundBlur: 'low',
  reducedMotion: false,
  controls: 'buttons',
  keyboardHint: true
}

function getDefaultSettings() {
  const prefersTouchZones = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches

  return {
    ...DEFAULT_SETTINGS,
    controls: prefersTouchZones ? 'zones' : DEFAULT_SETTINGS.controls
  }
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
