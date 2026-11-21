// Line trend view: a smoothed daily average with the year before as context.

const DAY_MS = 24 * 60 * 60 * 1000
export const TREND_WINDOW = 28
// 52 weeks back keeps weekdays aligned for periods up to a year. GitHub's
// default view spans 53 weeks, so longer periods shift back by their own
// length: the comparison must never reuse days that are on screen.
export const comparisonOffset = (days) => Math.max(364, days.length)

// Keyboard position per chart, so a re-render can put it back.
const keyboardState = new WeakMap()

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]
const dateKey = (time) => new Date(time).toISOString().slice(0, 10)
const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
})
const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC'
})
const sum = (values) => values.reduce((total, value) => total + value, 0)
const formatNumber = (value) => value.toLocaleString('en-US')
const formatAverage = (value) =>
  value === null || value === undefined ? '–' : value.toFixed(1)

/**
 * Earlier dates needed for the comparison line: the visible period shifted
 * back by comparisonOffset, plus enough days to fill the first averaging
 * windows of both lines. Anything from the first visible day on is already on
 * the page.
 */
export const comparisonRange = (days, window = TREND_WINDOW) => {
  const first = days[0].date.getTime()
  return {
    start: new Date(first - (comparisonOffset(days) + window - 1) * DAY_MS),
    end: new Date(first - DAY_MS)
  }
}

/**
 * One point per visible day. Averages use whichever days of each window are
 * known, so the start of the line is not dragged toward zero by missing data.
 * Comparison fields are null until earlier data is supplied.
 * @param {Array<{date: Date, count: number}>} days - Visible days, ascending
 * @param {Array<{date: Date, count: number}>|null} history - Earlier days
 */
export const buildTrendSeries = (
  days,
  history = null,
  window = TREND_WINDOW
) => {
  const counts = new Map()
  for (const day of history ?? []) counts.set(dateKey(day.date), day.count)
  for (const day of days) counts.set(dateKey(day.date), day.count)

  const average = (time) => {
    let total = 0
    let known = 0
    for (let offset = 0; offset < window; offset++) {
      const count = counts.get(dateKey(time - offset * DAY_MS))
      if (count !== undefined) {
        total += count
        known++
      }
    }
    return known ? total / known : null
  }

  const offset = comparisonOffset(days)
  let cumulative = 0
  let previousCumulative = 0
  return days.map((day) => {
    const time = day.date.getTime()
    cumulative += day.count
    const point = {
      date: day.date,
      count: day.count,
      average: average(time),
      cumulative,
      previousCount: null,
      previousAverage: null,
      previousCumulative: null
    }
    if (history) {
      const previousTime = time - offset * DAY_MS
      point.previousCount = counts.get(dateKey(previousTime)) ?? null
      previousCumulative += point.previousCount ?? 0
      point.previousAverage = average(previousTime)
      point.previousCumulative = previousCumulative
    }
    return point
  })
}

const longestRun = (series) => {
  let best = { start: -1, length: 0 }
  let start = 0
  series.forEach((point, index) => {
    if (point.count === 0) {
      start = index + 1
    } else if (index - start + 1 > best.length) {
      best = { start, length: index - start + 1 }
    }
  })
  return best
}

/** Headline numbers shown beneath the chart. */
export const trendSummary = (series) => {
  const counts = series.map((point) => point.count)
  const recent = counts.slice(-30)
  const prior = counts.slice(-60, -30)
  const last30 = recent.length === 30 ? sum(recent) / 30 : null
  const prior30 = prior.length === 30 ? sum(prior) / 30 : null
  const weekdayTotals = Array.from({ length: 7 }, () => 0)
  for (const point of series) {
    weekdayTotals[point.date.getUTCDay()] += point.count
  }
  const total = series.at(-1)?.cumulative ?? 0
  const busiest = weekdayTotals.indexOf(Math.max(...weekdayTotals))
  let bestIndex = -1
  series.forEach((point, index) => {
    if (point.count > (series[bestIndex]?.count ?? 0)) bestIndex = index
  })
  return {
    last30,
    prior30,
    change: last30 !== null && prior30 > 0 ? last30 / prior30 - 1 : null,
    total,
    previousTotal: series.at(-1)?.previousCumulative ?? null,
    busiestWeekday: total > 0 ? WEEKDAYS[busiest] : null,
    busiestShare: total > 0 ? weekdayTotals[busiest] / total : null,
    bestIndex,
    longestStreak: longestRun(series)
  }
}

/** A round axis maximum with about four gridlines. */
export const niceAxis = (value) => {
  const top = Math.max(value, 4)
  const raw = top / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / magnitude
  const step =
    (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude
  return { step, max: step * Math.ceil(top / step) }
}

const signedPercent = (ratio) =>
  `${ratio >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(ratio * 100))}%`

const statTile = (label, value, detail) => `
  <div class="p-2 flex-1">
    <span class="d-block text-small text-bold">${label}</span>
    <span class="d-block f2 text-bold ic-accent lh-condensed">${value}</span>
    <span class="d-block text-small color-fg-muted">${detail}</span>
  </div>`

const statsMarkup = (summary, { comparison, endsToday }) => {
  const recentLabel = endsToday ? 'Last 30 days' : 'Final 30 days'
  let recentDetail = ''
  if (summary.change !== null) {
    recentDetail = `${signedPercent(summary.change)} vs the 30 days before`
  } else if (summary.last30 > 0 && summary.prior30 === 0) {
    recentDetail = 'None in the 30 days before'
  }
  const recent = statTile(
    recentLabel,
    summary.last30 === null
      ? '–'
      : `${formatAverage(summary.last30)} <span class="f4">/ day</span>`,
    recentDetail
  )

  let yearValue = '…'
  let yearDetail = 'Loading the year before…'
  if (comparison === 'unavailable') {
    yearValue = '–'
    yearDetail = 'The year before is unavailable'
  } else if (comparison === 'ready') {
    const { total, previousTotal } = summary
    yearValue =
      previousTotal > 0
        ? signedPercent(total / previousTotal - 1)
        : formatNumber(total)
    yearDetail =
      previousTotal > 0
        ? `${formatNumber(total)} vs ${formatNumber(previousTotal)} the year before`
        : 'None the year before'
  }
  const year = statTile('Compared with the year before', yearValue, yearDetail)

  const weekday = statTile(
    'Most active weekday',
    summary.busiestWeekday ?? '–',
    summary.busiestShare === null
      ? 'No contributions in this period'
      : `${Math.round(summary.busiestShare * 100)}% of contributions`
  )

  return `<div class="ic-line-stats d-flex flex-wrap rounded-2 border px-1 px-md-2 mt-2">${recent}${year}${weekday}</div>`
}

const legendMarkup = (mode, hasComparison) => {
  const items =
    mode === 'cumulative'
      ? ['<span><i class="ic-key ic-key-line"></i>Running total</span>']
      : [
          '<span><i class="ic-key ic-key-bar"></i>Daily</span>',
          `<span><i class="ic-key ic-key-line"></i>${TREND_WINDOW}-day average</span>`
        ]
  if (hasComparison) {
    items.push('<span><i class="ic-key ic-key-previous"></i>Year before</span>')
  }
  return items.join(' ')
}

const chartDescription = (summary, mode, hasComparison) => {
  const parts = [
    mode === 'cumulative'
      ? `Running total of contributions, reaching ${formatNumber(summary.total)}`
      : `${TREND_WINDOW}-day average of daily contributions`
  ]
  if (hasComparison && summary.previousTotal !== null) {
    parts.push(
      `compared with ${formatNumber(summary.previousTotal)} the year before`
    )
  }
  return `${parts.join(', ')}. Use the left and right arrow keys to read each day.`
}

const HEIGHT = 220
const MARGIN = { top: 24, right: 72, bottom: 22 }
// Approximate width of one 11px axis digit, used to fit the longest label.
const LABEL_CHAR_WIDTH = 6.6

/** Width available for the chart inside the container's padding. */
const contentWidth = (container) => {
  if (!container.clientWidth) return 0
  const style = getComputedStyle(container)
  return (
    container.clientWidth -
    (Number.parseFloat(style.paddingLeft) || 0) -
    (Number.parseFloat(style.paddingRight) || 0)
  )
}

/**
 * Render the line view into a container.
 * @param {Element} container - Element that receives the chart
 * @param {Array} series - Output of buildTrendSeries
 * @param {Object} options
 * @param {'activity'|'cumulative'} options.mode
 * @param {'loading'|'ready'|'unavailable'} options.comparison
 * @param {boolean} options.endsToday - Whether the period ends today
 * @param {Function} options.onModeChange - Called with the chosen mode
 */
export const renderTrendChart = (container, series, options) => {
  const { mode, comparison, endsToday, onModeChange } = options
  const summary = trendSummary(series)
  const hasComparison = comparison === 'ready'
  const cumulative = mode === 'cumulative'
  // Hidden containers measure zero; a resize observer re-renders once shown.
  const measured = contentWidth(container)
  const width = measured ? Math.max(measured, 320) : 860
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const last = Math.max(series.length - 1, 1)

  const primary = series.map((point) =>
    cumulative ? point.cumulative : point.average
  )
  const reference = hasComparison
    ? series.map((point) =>
        cumulative ? point.previousCumulative : point.previousAverage
      )
    : []
  const highest = Math.max(
    0,
    ...primary.filter(Number.isFinite),
    ...reference.filter(Number.isFinite)
  )
  // Leave room above the trend for daily bars; one outlier day is clipped
  // rather than flattening every other day.
  const axis = niceAxis(highest * (cumulative ? 1.05 : 1.4))
  // Room for the longest y-axis label plus a gap before the plot.
  const marginLeft = Math.ceil(
    formatNumber(axis.max).length * LABEL_CHAR_WIDTH + 10
  )
  const innerWidth = width - marginLeft - MARGIN.right
  const x = (index) => marginLeft + (index / last) * innerWidth
  const y = (value) =>
    MARGIN.top +
    innerHeight -
    (Math.min(value, axis.max) / axis.max) * innerHeight
  const baseline = y(0)
  const path = (values) =>
    values
      .map((value, index) =>
        Number.isFinite(value)
          ? `${index && Number.isFinite(values[index - 1]) ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`
          : ''
      )
      .join('')

  let svg = ''
  for (let value = 0; value <= axis.max; value += axis.step) {
    const lineY = y(value).toFixed(1)
    svg += `<line class="ic-line-grid${value ? '' : ' ic-line-baseline'}" x1="${marginLeft}" x2="${width - MARGIN.right}" y1="${lineY}" y2="${lineY}"/>`
    svg += `<text x="${marginLeft - 6}" y="${Number(lineY) + 4}" text-anchor="end">${formatNumber(value)}</text>`
  }
  const monthSpacing = (innerWidth / series.length) * 30
  let monthCount = 0
  series.forEach((point, index) => {
    if (point.date.getUTCDate() !== 1) return
    if (monthSpacing < 34 && monthCount++ % 2) return
    svg += `<text x="${x(index).toFixed(1)}" y="${HEIGHT - 6}">${monthFormat.format(point.date)}</text>`
  })

  if (!cumulative) {
    const { start, length } = summary.longestStreak
    if (length >= 2) {
      const left = x(start)
      const right = x(start + length - 1)
      const center = Math.min(
        Math.max((left + right) / 2, marginLeft + 60),
        width - MARGIN.right - 60
      )
      svg += `<rect class="ic-line-band" x="${left.toFixed(1)}" y="${MARGIN.top}" width="${(right - left).toFixed(1)}" height="${innerHeight}"/>`
      svg += `<text x="${center.toFixed(1)}" y="${MARGIN.top - 8}" text-anchor="middle">Longest streak · ${length} days</text>`
    }
    const barWidth = Math.max(
      1,
      Math.min(4, (innerWidth / series.length) * 0.6)
    )
    series.forEach((point, index) => {
      if (!point.count) return
      svg += `<rect class="ic-line-bar" x="${(x(index) - barWidth / 2).toFixed(1)}" y="${y(point.count).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(baseline - y(point.count)).toFixed(1)}"/>`
    })
  } else {
    svg += `<path class="ic-line-area" d="${path(primary)}L${x(last).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z"/>`
  }

  if (hasComparison) {
    svg += `<path class="ic-line-previous" d="${path(reference)}"/>`
  }
  svg += `<path class="ic-line-primary" d="${path(primary)}"/>`

  // Direct end labels so the lines are identifiable without the legend.
  const endPrimary = y(primary.at(-1) ?? 0)
  const endReference = hasComparison ? y(reference.at(-1) ?? 0) : null
  const nudge =
    endReference !== null && Math.abs(endPrimary - endReference) < 14
      ? endPrimary <= endReference
        ? -7
        : 7
      : 0
  svg += `<text class="ic-line-label" x="${width - MARGIN.right + 6}" y="${(endPrimary + 4 + nudge).toFixed(1)}">${cumulative ? formatNumber(primary.at(-1) ?? 0) : 'This period'}</text>`
  if (endReference !== null) {
    svg += `<text x="${width - MARGIN.right + 6}" y="${(endReference + 4 - nudge).toFixed(1)}">${cumulative ? formatNumber(reference.at(-1) ?? 0) : 'Year before'}</text>`
  }

  if (!cumulative && summary.bestIndex >= 0) {
    const best = series[summary.bestIndex]
    const bestX = x(summary.bestIndex)
    const bestY = y(best.count)
    const onLeft = bestX > marginLeft + innerWidth / 2
    svg += `<circle class="ic-line-best" cx="${bestX.toFixed(1)}" cy="${bestY.toFixed(1)}" r="4"/>`
    svg += `<text class="ic-line-label" x="${(bestX + (onLeft ? -8 : 8)).toFixed(1)}" y="${(bestY + 4).toFixed(1)}" text-anchor="${onLeft ? 'end' : 'start'}">Best day · ${formatNumber(best.count)}${best.count > axis.max ? ' ↑' : ''}</text>`
  }

  svg += `<g class="ic-line-hover" visibility="hidden">
      <line class="ic-line-crosshair" y1="${MARGIN.top}" y2="${MARGIN.top + innerHeight}"/>
      ${hasComparison ? '<circle class="ic-line-hover-previous" r="3.5"/>' : ''}
      <circle class="ic-line-hover-primary" r="4.5"/>
    </g>`

  const modeButton = (value, label) =>
    `<button type="button" class="btn BtnGroup-item btn-sm py-0 px-2${mode === value ? ' selected' : ''}" data-ic-line-mode="${value}" aria-pressed="${mode === value}">${label}</button>`

  // Re-rendering replaces every element; remember what had keyboard focus.
  const focused = container.contains(document.activeElement)
    ? document.activeElement
    : null
  const refocus = focused?.dataset?.icLineMode
    ? `[data-ic-line-mode="${focused.dataset.icLineMode}"]`
    : focused?.matches?.('svg')
      ? 'svg'
      : null
  const previousActive = keyboardState.get(container) ?? null

  container.innerHTML = `
    <div class="d-flex flex-wrap flex-items-center flex-justify-between gap-2 mb-1">
      <div class="BtnGroup" role="group" aria-label="Line chart measure">
        ${modeButton('activity', 'Activity')}${modeButton('cumulative', 'Cumulative')}
      </div>
      <div class="ic-line-legend text-small color-fg-muted">${legendMarkup(mode, hasComparison)}</div>
    </div>
    <div class="ic-line-plot position-relative">
      <svg width="100%" viewBox="0 0 ${width} ${HEIGHT}" role="img" tabindex="0" aria-label="${chartDescription(summary, mode, hasComparison)}">${svg}</svg>
      <div class="ic-line-tip" aria-live="polite"></div>
    </div>
    ${statsMarkup(summary, { comparison, endsToday })}`

  for (const button of container.querySelectorAll('[data-ic-line-mode]')) {
    button.addEventListener('click', () => {
      if (button.dataset.icLineMode !== mode) {
        onModeChange?.(button.dataset.icLineMode)
      }
    })
  }

  const chart = container.querySelector('svg')
  const tip = container.querySelector('.ic-line-tip')
  const hover = chart.querySelector('.ic-line-hover')
  let active = null

  const show = (index) => {
    active = Math.max(0, Math.min(series.length - 1, index))
    keyboardState.set(container, active)
    const point = series[active]
    const pointX = x(active)
    hover.setAttribute('visibility', 'visible')
    const crosshair = hover.querySelector('.ic-line-crosshair')
    crosshair.setAttribute('x1', pointX)
    crosshair.setAttribute('x2', pointX)
    const primaryDot = hover.querySelector('.ic-line-hover-primary')
    primaryDot.setAttribute('cx', pointX)
    primaryDot.setAttribute('cy', y(primary[active] ?? 0))
    const previousDot = hover.querySelector('.ic-line-hover-previous')
    if (previousDot) {
      const value = reference[active]
      previousDot.setAttribute(
        'visibility',
        Number.isFinite(value) ? 'visible' : 'hidden'
      )
      previousDot.setAttribute('cx', pointX)
      previousDot.setAttribute('cy', y(value ?? 0))
    }
    const rows = cumulative
      ? [
          ['Running total', formatNumber(point.cumulative)],
          ...(hasComparison
            ? [
                ['Year before', formatNumber(point.previousCumulative)],
                [
                  'Difference',
                  `${point.cumulative >= point.previousCumulative ? '+' : '−'}${formatNumber(Math.abs(point.cumulative - point.previousCumulative))}`
                ]
              ]
            : [])
        ]
      : [
          ['Contributions', formatNumber(point.count)],
          [`${TREND_WINDOW}-day average`, formatAverage(point.average)],
          ...(hasComparison
            ? [['Year before, average', formatAverage(point.previousAverage)]]
            : [])
        ]
    tip.innerHTML = `<strong>${dayFormat.format(point.date)}</strong>${rows
      .map(
        ([label, value]) =>
          `<span class="ic-line-tip-row"><span>${label}</span><span>${value}</span></span>`
      )
      .join('')}`
    const scale = (chart.clientWidth || width) / width
    const left = pointX * scale
    const tipWidth = tip.offsetWidth
    tip.style.left = `${left + 12 + tipWidth > (chart.clientWidth || width) ? left - tipWidth - 12 : left + 12}px`
    tip.style.top = `${MARGIN.top * scale}px`
    tip.classList.add('ic-line-tip-visible')
  }
  const hide = () => {
    active = null
    keyboardState.delete(container)
    hover.setAttribute('visibility', 'hidden')
    tip.classList.remove('ic-line-tip-visible')
  }

  chart.addEventListener('pointermove', (event) => {
    const bounds = chart.getBoundingClientRect()
    if (!bounds.width) return
    const chartX = ((event.clientX - bounds.left) / bounds.width) * width
    show(Math.round(((chartX - marginLeft) / innerWidth) * last))
  })
  chart.addEventListener('pointerleave', hide)
  chart.addEventListener('blur', hide)
  chart.addEventListener('keydown', (event) => {
    const steps = {
      ArrowLeft: -1,
      ArrowRight: 1,
      Home: -Infinity,
      End: Infinity
    }
    if (event.key === 'Escape') return hide()
    if (!(event.key in steps)) return
    event.preventDefault()
    const step = steps[event.key]
    if (!Number.isFinite(step)) show(step < 0 ? 0 : series.length - 1)
    else show(active === null ? series.length - 1 : active + step)
  })

  if (refocus) {
    container.querySelector(refocus)?.focus({ preventScroll: true })
    if (refocus === 'svg' && previousActive !== null) show(previousActive)
  }

  return summary
}
