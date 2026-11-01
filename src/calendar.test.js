/** @vitest-environment jsdom */
import { afterEach, expect, it } from 'vitest'
import { intensityColor, renderCalendarIntensity } from './calendar.js'

afterEach(() => {
  document.body.innerHTML = ''
})

it('interpolates through every stop of an arbitrary palette', () => {
  const palette = ['#eeeeee', '#cceeff', '#88bbff', '#4488ff', '#0044cc']
  for (let level = 0; level < 5; level++) {
    expect(intensityColor(level / 4, palette)).toBe(palette[level])
  }
  expect(intensityColor(0.375, palette)).toBe(
    'color-mix(in srgb, #cceeff, #88bbff 50%)'
  )
  expect(intensityColor(-1, palette)).toBe(palette[0])
  expect(intensityColor(2, palette)).toBe(palette[4])
})

it('updates legend descriptions and preserves original calendar data and tooltip links', () => {
  document.body.innerHTML = `
    <style>.ContributionCalendar-day { fill: rgb(0, 128, 0); }</style>
    <div class="js-calendar-graph">
      <table><tbody><tr><td class="ContributionCalendar-day" data-date="2024-01-01" data-level="1" aria-labelledby="tip" aria-describedby="extra contribution-graph-legend-level-1" style="width: 10px; height: 10px;"></td></tr></tbody></table>
      <tool-tip id="tip">10 contributions on January 1st.</tool-tip>
      <div id="extra">Extra information</div>
      ${Array.from({ length: 5 }, (_, level) => `<div class="ContributionCalendar-day" data-level="${level}" id="contribution-graph-legend-level-${level}"><span class="sr-only">Original count level</span></div>`).join('')}
    </div>`
  const graph = document.querySelector('.js-calendar-graph')
  const day = graph.querySelector('td')
  const tooltip = graph.querySelector('tool-tip').outerHTML
  for (const [scale, label] of [
    ['linear', 'Linear'],
    ['square-root', 'Square root'],
    ['logarithmic', 'Logarithmic']
  ]) {
    renderCalendarIntensity(
      graph,
      [{ date: new Date('2024-01-01'), count: 10 }],
      609,
      scale
    )
    expect(graph.querySelectorAll('#ic-calendar-scale-label')).toHaveLength(1)
    const note = graph.querySelector('#ic-calendar-scale-label')
    expect(note.textContent).toBe(
      `Scale: ${label} · Color intensity · Peak: 609/day`
    )
    expect(note.title).toContain('2D color intensity')
    const swatches = graph.querySelectorAll('[data-level]:not([data-date])')
    expect(swatches).toHaveLength(5)
    for (const [level, swatch] of [...swatches].entries()) {
      expect(swatch.title).toContain(
        `${level * 25}% ${label.toLowerCase()} color intensity`
      )
      expect(swatch.querySelector('.sr-only').textContent).toBe(swatch.title)
      expect(swatch.getAttribute('aria-label')).toBe(swatch.title)
    }
    expect(day.dataset).toMatchObject({ date: '2024-01-01', level: '1' })
    expect(day.getAttribute('aria-labelledby')).toBe('tip')
    expect(day.getAttribute('aria-describedby')).toBe(
      'extra ic-calendar-scale-label'
    )
    expect(day.style.width).toBe('10px')
    expect(day.style.height).toBe('10px')
    expect(graph.querySelector('tool-tip').outerHTML).toBe(tooltip)
  }
})
