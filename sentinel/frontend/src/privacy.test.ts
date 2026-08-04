import { describe, expect, it, vi } from 'vitest'
import { loadPrivacy, privacyLabels, savePrivacy } from './privacy'

describe('privacy mode', () => {
  it('replaces identifying labels only when enabled', () => {
    const privateLabels = privacyLabels(true)
    expect(privateLabels.host('my-host')).toBe('Production Host')
    expect(privateLabels.container('billing', 1)).toBe('Container 02')
    expect(privateLabels.image('private/app', 0)).toBe('private/image-1:stable')
    expect(privateLabels.filesystem('/secret', 1)).toBe('/volume-2')
    expect(privacyLabels(false).host('my-host')).toBe('my-host')
  })
  it('persists locally', () => {
    const storage = { getItem: vi.fn(() => 'true'), setItem: vi.fn() }
    expect(loadPrivacy(storage)).toBe(true)
    savePrivacy(false, storage)
    expect(storage.setItem).toHaveBeenCalledWith('automaton-sentinel-privacy', 'false')
  })
})
