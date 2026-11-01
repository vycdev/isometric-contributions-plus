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
