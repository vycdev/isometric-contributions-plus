import { describe, expect, it } from 'vitest'
import {
  createContributionPalette,
  DEFAULT_CONTRIBUTION_COLOR,
  isDarkTheme,
  normalizeContributionColor
} from './palette.js'

const luminance = (hex) => {
  const rgb = hex.match(/[\da-f]{2}/g).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

it.each([undefined, null, {}, '#123', '#gggggg', 'red', 'toString'])(
  'defaults an invalid stored color (%s) to blue',
  (value) => {
    expect(normalizeContributionColor(value)).toBe(DEFAULT_CONTRIBUTION_COLOR)
  }
)

it('normalizes full hex colors without changing the selection', () => {
  expect(normalizeContributionColor('#A12BCD')).toBe('#a12bcd')
})

describe.each([false, true])('palette in dark mode = %s', (dark) => {
  it.each([
    '#0969da',
    '#ff0000',
    '#ffff00',
    '#00ff00',
    '#000000',
    '#ffffff',
    '#888888'
  ])('keeps every intensity distinct and accents readable for %s', (color) => {
    const { levels, accent } = createContributionPalette(color, dark)
    expect(levels).toHaveLength(5)
    expect(new Set(levels).size).toBe(5)
    const intensities = levels.map(luminance)
    for (let i = 1; i < intensities.length; i++) {
      expect(contrast(intensities[i], intensities[i - 1])).toBeGreaterThan(1.45)
      expect(
        dark
          ? intensities[i] > intensities[i - 1]
          : intensities[i] < intensities[i - 1]
      ).toBe(true)
    }
    for (const background of dark
      ? ['#0d1117', '#22272e']
      : ['#ffffff', '#f6f8fa']) {
      expect(
        contrast(luminance(accent), luminance(background))
      ).toBeGreaterThan(4.5)
    }
    for (const shade of [...levels, accent]) {
      expect(shade).toMatch(/^#[\da-f]{6}$/)
    }
  })
})

it('uses GitHub’s explicit appearance before the system preference', () => {
  expect(isDarkTheme({ dataset: { colorMode: 'light' } }, true)).toBe(false)
  expect(isDarkTheme({ dataset: { colorMode: 'dark' } }, false)).toBe(true)
  expect(isDarkTheme({ dataset: { colorMode: 'auto' } }, true)).toBe(true)
  expect(isDarkTheme({ dataset: {} }, false)).toBe(false)
})
