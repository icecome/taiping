import { describe, expect, it } from 'vitest'
import { createMediaConfig, parseSiteSettings } from '../src/settings'

describe('createMediaConfig', () => {
  it('generates id via createId and keeps defaults when partial overrides', () => {
    const cfg = createMediaConfig({ name: '图床A', quality: 90 })
    expect(cfg.id.startsWith('mc_')).toBe(true)
    expect(cfg.name).toBe('图床A')
    expect(cfg.quality).toBe(90)
    expect(cfg.source).toBe('github')
    expect(cfg.cdnProvider).toBe('jsdmirror')
  })

  it('accepts provided id', () => {
    expect(createMediaConfig({ id: 'mc_fixed' }).id).toBe('mc_fixed')
  })
})

describe('parseSiteSettings recovery', () => {
  it('clamps out of range postsPerPage without throwing', () => {
    const parsed = parseSiteSettings({ postsPerPage: 999 })
    expect(parsed.postsPerPage).toBe(50)
  })
})
