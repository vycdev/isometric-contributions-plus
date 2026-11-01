import { HEIGHT_SCALES } from './settings.js'
import { contributionIntensity } from './utils.js'

// Sample unscaled palette stops, not already transformed day colors. Theme or
// palette features can supply these through .ContributionCalendar-day[data-level].
const readCalendarPalette = (graph) => {
  const probe = document.createElement('div')
  probe.className = 'ContributionCalendar-day'
  probe.hidden = true
  graph.append(probe)
  const palette = Array.from({ length: 5 }, (_, level) => {
    probe.dataset.level = level
    return getComputedStyle(probe).getPropertyValue('fill')
  })
  probe.remove()
  return palette
}

/** Interpolate through every palette stop without assuming a particular hue. */
export const intensityColor = (intensity, palette) => {
  const position = Math.max(0, Math.min(1, intensity)) * (palette.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return palette[lower]
  return `color-mix(in srgb, ${palette[lower]}, ${palette[upper]} ${(position - lower) * 100}%)`
}

export const renderCalendarIntensity = (
  graph,
  days,
  maxCount,
  scale,
  palette = readCalendarPalette(graph)
) => {
  const counts = new Map(
    days.map((day) => [day.date.toISOString().slice(0, 10), day.count])
  )
  const labelId = 'ic-calendar-scale-label'
  for (const element of graph.querySelectorAll(
    '.ContributionCalendar-day[data-date]'
  )) {
    const intensity = contributionIntensity(
      counts.get(element.dataset.date),
      maxCount,
      scale
    )
    element.style.setProperty(
      '--ic-intensity-color',
      intensityColor(intensity, palette)
    )
    // GitHub's original level description no longer describes the encoding.
    // Keep other descriptions and all tooltip/count/date attributes intact.
    const descriptions = (element.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && !id.startsWith('contribution-graph-legend-level-'))
    if (!descriptions.includes(labelId)) descriptions.push(labelId)
    element.setAttribute('aria-describedby', descriptions.join(' '))
  }
  graph.classList.add('ic-calendar-scaled')

  const { label, description } = HEIGHT_SCALES[scale]
  let scaleLabel = graph.querySelector(`#${labelId}`)
  if (!scaleLabel) {
    scaleLabel = document.createElement('p')
    scaleLabel.id = labelId
    scaleLabel.className = 'color-fg-muted text-small mt-1 mb-0'
    graph.append(scaleLabel)
  }
  scaleLabel.textContent = `Scale: ${label} · Color intensity · Peak: ${maxCount.toLocaleString()}/day`
  scaleLabel.title = `${description} Inactive days stay neutral; the busiest visible day uses maximum intensity.`

  // The five swatches mark equal steps in transformed intensity, not GitHub's
  // original count bins. Continuous colors between them describe daily counts.
  for (const swatch of graph.querySelectorAll(
    '.ContributionCalendar-day[data-level]:not([data-date])'
  )) {
    const level = Number(swatch.dataset.level)
    const text = `${level * 25}% ${label.toLowerCase()} color intensity${level === 0 ? ' (no contributions)' : ''}`
    swatch.title = text
    swatch.setAttribute('aria-label', text)
    const accessibleText = swatch.querySelector('.sr-only')
    if (accessibleText) accessibleText.textContent = text
  }
}
