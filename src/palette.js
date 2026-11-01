export const DEFAULT_CONTRIBUTION_COLOR = '#0969da'

export const normalizeContributionColor = (value) =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_CONTRIBUTION_COLOR

const channels = (hex) =>
  [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))

const luminance = (rgb) =>
  rgb.reduce((sum, channel, index) => {
    const value = channel / 255
    const linear =
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    return sum + linear * [0.2126, 0.7152, 0.0722][index]
  }, 0)

// Mix toward white or black to give every hue (including yellow and gray)
// the same readable intensity steps and sufficient contrast for accent text.
const shadeAtLuminance = (rgb, target) => {
  const endpoint = luminance(rgb) < target ? 255 : 0
  let low = 0
  let high = 1
  let mixed = rgb
  for (let i = 0; i < 16; i++) {
    const amount = (low + high) / 2
    mixed = rgb.map((channel) => channel + (endpoint - channel) * amount)
    const needsMoreMix =
      endpoint === 255 ? luminance(mixed) < target : luminance(mixed) > target
    if (needsMoreMix) {
      low = amount
    } else {
      high = amount
    }
  }
  return `#${mixed.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

export const createContributionPalette = (color, dark = false) => {
  const rgb = channels(normalizeContributionColor(color))
  const targets = dark ? [0.045, 0.12, 0.25, 0.46] : [0.52, 0.28, 0.14, 0.055]
  const levels = [
    dark ? '#161b22' : '#ebedf0',
    ...targets.map((target) => shadeAtLuminance(rgb, target))
  ]
  return {
    levels,
    accent: shadeAtLuminance(rgb, dark ? 0.46 : 0.12),
    selected: shadeAtLuminance(rgb, dark ? 0.025 : 0.9)
  }
}

export const applyContributionPalette = (element, palette) => {
  palette.levels.forEach((color, level) => {
    element.style.setProperty(`--ic-level-${level}`, color)
  })
  element.style.setProperty('--ic-accent', palette.accent)
  element.style.setProperty('--ic-selected', palette.selected)
}

export const isDarkTheme = (root, prefersDark) => {
  const mode = root.dataset.colorMode
  return mode === 'dark' || (mode !== 'light' && prefersDark)
}
