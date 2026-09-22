import { describe, expect, it } from 'vitest'
import { readCookie } from './cookie'
import { encodeGitHubPath } from './github'

describe('readCookie', () => {
  it('reads a named cookie', () => {
    expect(readCookie('a=1; tp_session=abc.def.sig; b=2', 'tp_session')).toBe('abc.def.sig')
    expect(readCookie('a=1', 'missing')).toBeUndefined()
    expect(readCookie(undefined, 'a')).toBeUndefined()
    expect(readCookie('', 'a')).toBeUndefined()
  })
})

describe('encodeGitHubPath', () => {
  it('encodes each path segment', () => {
    expect(encodeGitHubPath('uploads/a b/c.png')).toBe('uploads/a%20b/c.png')
    expect(encodeGitHubPath('a/b')).toBe('a/b')
  })
})
