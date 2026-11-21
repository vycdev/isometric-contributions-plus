export const HEIGHT_SCALES = {
  linear: {
    label: 'Linear',
    summary: 'Height and color intensity proportional to counts.',
    description:
      'Linear 3D heights and 2D color intensity are proportional to contribution counts.'
  },
  'square-root': {
    label: 'Square root',
    summary: 'A gentle boost for everyday activity.',
    description:
      'Square-root 3D heights and 2D color intensity give everyday activity a moderate boost. They are not proportional to counts.'
  },
  logarithmic: {
    label: 'Logarithmic',
    summary: 'A stronger boost for quieter days.',
    description:
      'Logarithmic 3D heights and 2D color intensity keep quieter days visible alongside contribution peaks. They are not proportional to counts.'
  }
}

export const normalizeHeightScale = (value) =>
  Object.hasOwn(HEIGHT_SCALES, value) ? value : 'linear'

// Display order on the page: 3D, line, then GitHub's own 2D calendar.
export const VIEWS = {
  cubes: {
    label: '3D isometric',
    summary: 'Cubes with totals, best day and streaks.'
  },
  line: {
    label: 'Line trend',
    summary: '28-day average compared with the year before.'
  },
  squares: {
    label: '2D calendar',
    summary: "GitHub's calendar, colored by your scale."
  }
}

export const DEFAULT_VIEWS = ['cubes']

const LEGACY_VIEWS = {
  squares: ['squares'],
  cubes: ['cubes'],
  both: ['cubes', 'squares']
}

/**
 * Return the enabled views in display order. Falls back to the retired
 * 2D/3D/Both toggle so existing preferences survive the upgrade.
 */
export const normalizeViews = (value, legacyToggle) => {
  if (Array.isArray(value)) {
    const views = Object.keys(VIEWS).filter((view) => value.includes(view))
    if (views.length) return views
  }
  return [...(LEGACY_VIEWS[legacyToggle] ?? DEFAULT_VIEWS)]
}

export const LINE_MODES = ['activity', 'cumulative']

export const normalizeLineMode = (value) =>
  LINE_MODES.includes(value) ? value : 'activity'
