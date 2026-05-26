import { STORAGE_KEYS } from './config.js'

export const DEFAULT_SETTINGS = {
  spriteStyle: 'pixel-gaps',
  screenShake: 'low',
  reducedMotion: false,
  controls: 'buttons',
  keyboardHint: true
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
}
