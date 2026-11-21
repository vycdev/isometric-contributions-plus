/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import {
  buildTrendSeries,
  comparisonOffset,
  comparisonRange,
  niceAxis,
  renderTrendChart,
  TREND_WINDOW,
  trendSummary
} from './line.js'

const DAY_MS = 86400000
const iso = (date) => date.toISOString().slice(0, 10)
const range = (start, length, count = () => 1) =>
  Array.from({ length }, (_, index) => {
    const date = new Date(Date.parse(start) + index * DAY_MS)
    return { date, count: count(index, date) }
  })

describe('comparisonRange', () => {
  it('shifts a partial year back 52 weeks so weekdays line up', () => {
    const days = range('2026-01-01', 325)
    expect(comparisonOffset(days)).toBe(364)
    expect(iso(comparisonRange(days).start)).toBe('2024-12-06')
  })

  it('shifts longer periods back by their own length, never overlapping', () => {
    // GitHub's default view spans 53 weeks.
    const days = range('2025-11-16', 371)
    expect(comparisonOffset(days)).toBe(371)
    const { start, end } = comparisonRange(days)
    expect(iso(start)).toBe('2024-10-14')
    expect(iso(end)).toBe('2025-11-15')
  })

  it('stops before the first visible day, even for a short period', () => {
    const { end } = comparisonRange(range('2026-01-01', 40))
    expect(iso(end)).toBe('2025-12-31')
  })
})

describe('buildTrendSeries', () => {
  it('averages the known days of each window without earlier data', () => {
    const series = buildTrendSeries(range('2025-01-01', 3, (i) => [3, 0, 6][i]))
    expect(series.map((point) => point.average)).toEqual([3, 1.5, 3])
    expect(series.map((point) => point.cumulative)).toEqual([3, 3, 9])
    expect(series[0].previousAverage).toBeNull()
    expect(series[0].previousCumulative).toBeNull()
  })

  it('uses earlier data for the first window and the comparison line', () => {
    const days = range('2025-01-01', 30, () => 2)
    const history = range(
      iso(comparisonRange(days).start),
      364 + TREND_WINDOW,
      () => 1
    )
    const series = buildTrendSeries(days, history)
    // The first window mixes 27 earlier days of 1 with one visible day of 2.
    expect(series[0].average).toBeCloseTo((27 + 2) / 28)
    expect(series.at(-1).average).toBe(2)
    expect(series[0].previousCount).toBe(1)
    expect(series[0].previousAverage).toBe(1)
    expect(series.at(-1).previousCumulative).toBe(30)
  })

  it('compares a 53-week period with the 53 weeks before it', () => {
    const days = range('2025-11-16', 371, () => 5)
    const history = range(iso(comparisonRange(days).start), 398, () => 1)
    const series = buildTrendSeries(days, history)
    // Every comparison day comes from before the period: none are counted twice.
    expect(series.every((point) => point.previousCount === 1)).toBe(true)
    expect(series.at(-1).previousCumulative).toBe(371)
    expect(series.at(-1).cumulative).toBe(1855)
  })
})

describe('trendSummary', () => {
  it('compares the last 30 days with the 30 before', () => {
    const series = buildTrendSeries(
      range('2025-01-01', 60, (i) => (i < 30 ? 1 : 3))
    )
    const summary = trendSummary(series)
    expect(summary.last30).toBe(3)
    expect(summary.prior30).toBe(1)
    expect(summary.change).toBeCloseTo(2)
    expect(summary.total).toBe(120)
    expect(summary.previousTotal).toBeNull()
  })

  it('finds the busiest weekday, first best day and longest streak', () => {
    // 2025-01-06 is a Monday.
    const counts = [5, 0, 2, 9, 9, 1, 1, 1, 0, 4]
    const summary = trendSummary(
      buildTrendSeries(range('2025-01-06', counts.length, (i) => counts[i]))
    )
    expect(summary.busiestWeekday).toBe('Thursday')
    expect(summary.busiestShare).toBeCloseTo(9 / 32)
    expect(summary.bestIndex).toBe(3)
    expect(summary.longestStreak).toEqual({ start: 2, length: 6 })
    expect(summary.last30).toBeNull()
  })

  it('handles a period without contributions', () => {
    const summary = trendSummary(
      buildTrendSeries(range('2025-01-01', 60, () => 0))
    )
    expect(summary.change).toBeNull()
    expect(summary.busiestWeekday).toBeNull()
    expect(summary.bestIndex).toBe(-1)
    expect(summary.longestStreak.length).toBe(0)
  })
})

it.each([
  [0, { step: 1, max: 4 }],
  [10, { step: 5, max: 10 }],
  [37, { step: 10, max: 40 }],
  [1234, { step: 500, max: 1500 }]
])('rounds an axis maximum of %d', (value, expected) => {
  expect(niceAxis(value)).toEqual(expected)
})

describe('renderTrendChart', () => {
  const days = range('2025-01-01', 365, (i) => (i % 7 === 3 ? 0 : (i % 5) + 1))
  const history = range(
    iso(comparisonRange(days).start),
    364 + TREND_WINDOW + 1,
    () => 1
  )
  const render = (options = {}, series = buildTrendSeries(days, history)) => {
    const container = document.createElement('div')
    document.body.replaceChildren(container)
    const onModeChange = vi.fn()
    renderTrendChart(container, series, {
      mode: 'activity',
      comparison: 'ready',
      endsToday: true,
      onModeChange,
      ...options
    })
    return { container, onModeChange }
  }
  const text = (container, selector) =>
    container.querySelector(selector).textContent.replace(/\s+/g, ' ').trim()

  it('draws the average, daily bars, comparison and annotations', () => {
    const { container } = render()
    expect(
      container.querySelector('.ic-line-primary').getAttribute('d')
    ).toMatch(/^M/)
    expect(container.querySelector('.ic-line-previous')).not.toBeNull()
    expect(container.querySelectorAll('.ic-line-bar').length).toBeGreaterThan(
      300
    )
    expect(container.querySelector('.ic-line-band')).not.toBeNull()
    expect(container.querySelector('svg').textContent).toContain('Best day · 5')
    expect(text(container, '.ic-line-legend')).toBe(
      'Daily 28-day average Year before'
    )
    expect(text(container, '.ic-line-stats')).toContain('Last 30 days')
    expect(text(container, '.ic-line-stats')).toContain('the year before')
    expect(container.querySelector('svg').getAttribute('aria-label')).toContain(
      'arrow keys'
    )
  })

  it('omits the comparison while loading or when unavailable', () => {
    const series = buildTrendSeries(days)
    const loading = render({ comparison: 'loading' }, series).container
    expect(loading.querySelector('.ic-line-previous')).toBeNull()
    expect(text(loading, '.ic-line-stats')).toContain('Loading the year before')
    const unavailable = render({ comparison: 'unavailable' }, series).container
    expect(text(unavailable, '.ic-line-stats')).toContain(
      'The year before is unavailable'
    )
    expect(text(unavailable, '.ic-line-legend')).not.toContain('Year before')
  })

  it('shows running totals in cumulative mode', () => {
    const { container } = render({ mode: 'cumulative', endsToday: false })
    expect(container.querySelector('.ic-line-area')).not.toBeNull()
    expect(container.querySelector('.ic-line-bar')).toBeNull()
    expect(text(container, '.ic-line-legend')).toBe('Running total Year before')
    expect(text(container, '.ic-line-stats')).toContain('Final 30 days')
    expect(
      container.querySelector('[data-ic-line-mode="cumulative"]').ariaPressed
    ).toBe('true')
  })

  it('reports mode changes but ignores the active mode', () => {
    const { container, onModeChange } = render()
    container.querySelector('[data-ic-line-mode="activity"]').click()
    expect(onModeChange).not.toHaveBeenCalled()
    container.querySelector('[data-ic-line-mode="cumulative"]').click()
    expect(onModeChange).toHaveBeenCalledWith('cumulative')
  })

  it('reads each day with the keyboard', () => {
    const { container } = render()
    const chart = container.querySelector('svg')
    const tip = container.querySelector('.ic-line-tip')
    const press = (key) =>
      chart.dispatchEvent(new KeyboardEvent('keydown', { key }))
    press('ArrowRight')
    expect(tip.textContent).toContain('Dec 31, 2025')
    press('ArrowLeft')
    expect(tip.textContent).toContain('Dec 30, 2025')
    expect(tip.textContent).toContain('Year before, average')
    press('Home')
    expect(tip.textContent).toContain('Jan 1, 2025')
    expect(tip.classList).toContain('ic-line-tip-visible')
    press('Escape')
    expect(tip.classList).not.toContain('ic-line-tip-visible')
  })

  it('widens the left margin to fit long axis labels', () => {
    const plotStart = (container) =>
      Number(container.querySelector('.ic-line-grid').getAttribute('x1'))
    const small = render({ comparison: 'loading' }, buildTrendSeries(days))
    const large = render(
      { mode: 'cumulative', comparison: 'loading' },
      buildTrendSeries(range('2025-01-01', 365, () => 40))
    )
    // "8" vs "15,000": each label fits with a 10px gap before the plot.
    expect(plotStart(small.container)).toBeLessThan(30)
    expect(plotStart(large.container)).toBeGreaterThanOrEqual(
      Math.ceil('15,000'.length * 6.6 + 10)
    )
  })

  it('keeps keyboard focus and the active day across re-renders', () => {
    const { container } = render()
    const rerender = (options) =>
      renderTrendChart(container, buildTrendSeries(days, history), {
        mode: 'activity',
        comparison: 'ready',
        endsToday: true,
        ...options
      })
    const chart = container.querySelector('svg')
    chart.focus()
    chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
    chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    // The comparison arriving or a resize re-renders the chart.
    rerender({})
    expect(document.activeElement).toBe(container.querySelector('svg'))
    expect(container.querySelector('.ic-line-tip').textContent).toContain(
      'Jan 2, 2025'
    )

    container.querySelector('[data-ic-line-mode="cumulative"]').focus()
    rerender({ mode: 'cumulative' })
    expect(document.activeElement).toBe(
      container.querySelector('[data-ic-line-mode="cumulative"]')
    )
  })

  it('renders an empty period without errors', () => {
    const empty = buildTrendSeries(range('2025-01-01', 365, () => 0))
    const { container } = render({ comparison: 'loading' }, empty)
    expect(container.querySelector('svg').textContent).not.toContain('Best day')
    expect(text(container, '.ic-line-stats')).toContain(
      'No contributions in this period'
    )
  })
})
