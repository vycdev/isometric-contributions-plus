import { describe, expect, it } from 'vitest'
import { normalizeLineMode, normalizeViews, VIEWS } from './settings.js'

describe('normalizeViews', () => {
  it('keeps known views in display order', () => {
    expect(Object.keys(VIEWS)).toEqual(['cubes', 'line', 'squares'])
    expect(normalizeViews(['squares', 'line', 'nope', 'line'])).toEqual([
      'line',
      'squares'
    ])
  })

  it.each([
    ['squares', ['squares']],
    ['cubes', ['cubes']],
    ['both', ['cubes', 'squares']],
    [undefined, ['cubes']],
    ['unknown', ['cubes']]
  ])('migrates the retired %s toggle', (toggle, expected) => {
    expect(normalizeViews(undefined, toggle)).toEqual(expected)
    expect(normalizeViews([], toggle)).toEqual(expected)
  })

  it('prefers saved views over the retired toggle', () => {
    expect(normalizeViews(['line'], 'both')).toEqual(['line'])
  })

  it('returns a fresh array each time', () => {
    const views = normalizeViews()
    views.push('line')
    expect(normalizeViews()).toEqual(['cubes'])
  })
})

it.each([
  ['cumulative', 'cumulative'],
  ['activity', 'activity'],
  ['other', 'activity'],
  [undefined, 'activity']
])('normalizes line mode %s', (value, expected) => {
  expect(normalizeLineMode(value)).toBe(expected)
})
