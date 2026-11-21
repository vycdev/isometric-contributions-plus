import { renderCalendarIntensity } from './calendar.js'
import {
  fetchContributionRange,
  fetchExtendedStreakData,
  fetchFollowingStreakData
} from './history.js'
import { buildTrendSeries, comparisonRange, renderTrendChart } from './line.js'
import {
  applyContributionPalette,
  createContributionPalette,
  DEFAULT_CONTRIBUTION_COLOR,
  isDarkTheme,
  normalizeContributionColor
} from './palette.js'
import {
  HEIGHT_SCALES,
  normalizeHeightScale,
  normalizeLineMode,
  normalizeViews
} from './settings.js'
import {
  applyViews,
  calculateStreaks,
  contributionHeight,
  datesDayDifference,
  generateContributionsMarkup,
  generateStreaksMarkup,
  getElementColor,
  isToday,
  loadSetting,
  localDateKey,
  parseCalendarGraph,
  precisionRound,
  saveSetting
} from './utils.js'
import {
  addPastYearLinks,
  restorePastYearScroll,
  themeYearList
} from './years.js'

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC'
})
const fullDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
})
const formatStreakDates = (start, end, streakLength) => {
  const formatter = streakLength > 365 ? fullDateFormat : dateFormat
  return `${formatter.format(start)} → ${formatter.format(end)}`
}

let days
let weeks
let calendarGraph
let contributionsBox
let yearTotal = 0
let weekTotal = 0
let averageCount = 0
let maxCount = 0
let countTotal = 0
let weekCountTotal = 0
let streakLongest = 0
let streakCurrent = 0
let longestStreakLoading = false
let currentStreakLoading = false
// Which directions a streak touching the period's edges may continue in.
let extendBackward = false
let extendForward = false
let bestDay = null
let firstDay = null
let lastDay = null
let datesTotal = null
let weekStartDay = null
let weekDatesTotal = null
let datesLongest = null
let datesCurrent = null
let dateBest = null
let views = normalizeViews()
let legacyToggle = null
let lineMode = 'activity'
let lineHistory = null
let lineComparison = 'loading'
let lineRequest = null
let lineResizeObserver = null
let cubesStale = false
let heightScale = 'linear'
let contributionColor = DEFAULT_CONTRIBUTION_COLOR
const colorScheme = globalThis.matchMedia('(prefers-color-scheme: dark)')
let palette
let chartGeneration = 0
let historyRequest = null

const cancelHistoryRequest = () => {
  chartGeneration++
  historyRequest?.abort()
  historyRequest = null
  lineRequest?.abort()
  lineRequest = null
  lineResizeObserver?.disconnect()
  lineResizeObserver = null
}

const resetValues = () => {
  cancelHistoryRequest()
  yearTotal = 0
  averageCount = 0
  maxCount = 0
  streakLongest = 0
  streakCurrent = 0
  longestStreakLoading = false
  currentStreakLoading = false
  weekTotal = 0
  bestDay = null
  firstDay = null
  lastDay = null
  datesLongest = null
  datesCurrent = null
  weekStartDay = null
  lineHistory = null
  lineComparison = 'loading'
}

const getStorage = () => {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local
  }

  return localStorage
}

const getSettings = async () => {
  legacyToggle = await loadSetting(getStorage(), 'toggleSetting', null)
  views = normalizeViews(
    await loadSetting(getStorage(), 'views', null),
    legacyToggle
  )
  lineMode = normalizeLineMode(
    await loadSetting(getStorage(), 'lineMode', 'activity')
  )
  const savedHeightScale = await loadSetting(
    getStorage(),
    'heightScale',
    'linear'
  )
  heightScale = normalizeHeightScale(savedHeightScale)
  contributionColor = normalizeContributionColor(
    await loadSetting(
      getStorage(),
      'contributionColor',
      DEFAULT_CONTRIBUTION_COLOR
    )
  )
  return 'Settings loaded'
}

const persistSetting = (key, value) => {
  saveSetting(getStorage(), key, value)
}

const getProfileUsername = () => {
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  return pathParts.length >= 1 ? pathParts[0] : null
}

const extendStreakDataAndUpdate = async () => {
  if (!longestStreakLoading && !currentStreakLoading) return

  const username = getProfileUsername()
  const generation = chartGeneration
  const sourceDays = days
  const periodEnd = lastDay
  const wrapper = document.querySelector('.ic-contributions-wrapper')
  const controller = new AbortController()
  historyRequest = controller
  let extendedDays = days.filter(
    (day) => day.date.getTime() <= periodEnd.getTime()
  )

  try {
    if (username && extendBackward) {
      extendedDays = await fetchExtendedStreakData(
        username,
        extendedDays,
        10,
        controller.signal
      )
    }
    if (username && extendForward) {
      extendedDays = await fetchFollowingStreakData(
        username,
        extendedDays,
        10,
        controller.signal
      )
    }
  } catch {
    // Keep the visible calendar on failure.
  }

  if (
    controller.signal.aborted ||
    generation !== chartGeneration ||
    sourceDays !== days ||
    username !== getProfileUsername() ||
    !wrapper?.isConnected
  ) {
    return
  }
  historyRequest = null

  const extendedStats = calculateStreaks(extendedDays, {
    countFrom: sourceDays[0].date,
    countUntil: periodEnd
  })
  streakLongest = extendedStats.streakLongest
  streakCurrent = extendedStats.streakCurrent
  longestStreakLoading = false
  currentStreakLoading = false

  datesLongest =
    streakLongest > 0 && extendedStats.longestStreakStart
      ? formatStreakDates(
          extendedStats.longestStreakStart,
          extendedStats.longestStreakEnd,
          streakLongest
        )
      : 'No longest streak'
  datesCurrent =
    streakCurrent > 0 && extendedStats.currentStreakStart
      ? formatStreakDates(
          extendedStats.currentStreakStart,
          extendedStats.currentStreakEnd,
          streakCurrent
        )
      : 'No current streak'

  const longestCountEl = document.getElementById('ic-streak-longest-count')
  const longestDatesEl = document.getElementById('ic-streak-longest-dates')
  const currentCountEl = document.getElementById('ic-streak-current-count')
  const currentDatesEl = document.getElementById('ic-streak-current-dates')

  if (longestCountEl)
    longestCountEl.innerHTML = `${streakLongest} <span class="f4">days</span>`
  if (longestDatesEl) longestDatesEl.textContent = datesLongest
  if (currentCountEl)
    currentCountEl.innerHTML = `${streakCurrent} <span class="f4">days</span>`
  if (currentDatesEl) currentDatesEl.textContent = datesCurrent
}

const initUI = () => {
  const contributionsWrapper = document.createElement('div')
  contributionsWrapper.className = 'ic-contributions-wrapper'
  calendarGraph.before(contributionsWrapper)

  // Statistics overlay the canvas, so they live with it in the 3D view.
  const cubesView = document.createElement('div')
  cubesView.className = 'ic-cubes-view position-relative'
  contributionsWrapper.append(cubesView)

  const canvas = document.createElement('canvas')
  canvas.id = 'isometric-contributions'
  canvas.width = 1000
  canvas.height = 600
  canvas.style.width = '100%'
  cubesView.append(canvas)

  const legend = document.createElement('div')
  legend.className =
    'ic-contribution-legend position-absolute bottom-0 right-0 mr-5 mb-3 text-small color-fg-muted'
  legend.setAttribute('role', 'img')
  legend.setAttribute('aria-label', 'Contribution activity, from less to more')
  legend.innerHTML = `Less ${[0, 1, 2, 3, 4]
    .map((level) => `<span data-level="${level}"></span>`)
    .join('')} More`
  cubesView.append(legend)

  const lineView = document.createElement('div')
  lineView.className = 'ic-line-view'
  contributionsWrapper.append(lineView)

  applyViews(contributionsBox, views)
}

const visibleDays = () =>
  days.filter((day) => day.date.getTime() <= lastDay.getTime())

const renderLineView = () => {
  const container = document.querySelector('.ic-line-view')
  if (!container || !views.includes('line')) return
  renderTrendChart(container, buildTrendSeries(visibleDays(), lineHistory), {
    mode: lineMode,
    comparison: lineComparison,
    endsToday: isToday(lastDay),
    onModeChange: (mode) => {
      lineMode = mode
      persistSetting('lineMode', mode)
      renderLineView()
    }
  })
  if (!lineResizeObserver && typeof ResizeObserver === 'function') {
    let width = container.clientWidth
    lineResizeObserver = new ResizeObserver(() => {
      if (container.clientWidth === width) return
      width = container.clientWidth
      renderLineView()
    })
    lineResizeObserver.observe(container)
  }
}

const loadLineComparison = async () => {
  if (lineRequest || lineComparison !== 'loading') return
  const username = getProfileUsername()
  const generation = chartGeneration
  const sourceDays = days
  const controller = new AbortController()
  lineRequest = controller
  const { start, end } = comparisonRange(visibleDays())
  let history = null
  try {
    history = await fetchContributionRange(
      username,
      start,
      end,
      controller.signal
    )
  } catch {
    // The chart still works without the comparison line.
  }
  if (
    controller.signal.aborted ||
    generation !== chartGeneration ||
    sourceDays !== days
  ) {
    return
  }
  lineRequest = null
  lineHistory = history
  lineComparison = history ? 'ready' : 'unavailable'
  renderLineView()
}

const showLineView = () => {
  if (!views.includes('line') || !document.querySelector('.ic-line-view'))
    return
  renderLineView()
  loadLineComparison()
}

const setViews = (nextViews) => {
  views = nextViews
  if (!contributionsBox?.isConnected) return
  applyViews(contributionsBox, views)
  if (cubesStale) renderCubes()
  showLineView()
}

const getSquareColor = (rect) =>
  palette.levels[Number(rect.dataset.level)]?.slice(1) ?? getElementColor(rect)

// The activity timeline and year list sit outside the contributions box and
// can load after it, so they are themed separately on each page change.
const themeContributionActivity = () => {
  if (!palette) return
  const activity = document.getElementById('js-contribution-activity')
  if (activity) {
    activity.classList.add('ic-activity-themed')
    applyContributionPalette(activity, palette)
  }
  themeYearList(palette)
}

// What the current palette was built from, to skip redundant redraws.
let themeKey = null
const currentThemeKey = () =>
  `${contributionColor}:${isDarkTheme(document.documentElement, colorScheme.matches)}`

const applyTheme = () => {
  themeKey = currentThemeKey()
  palette = createContributionPalette(
    contributionColor,
    isDarkTheme(document.documentElement, colorScheme.matches)
  )
  contributionsBox.classList.add('ic-themed')
  applyContributionPalette(contributionsBox, palette)
  themeContributionActivity()
}

const refreshColors = () => {
  calendarGraph.classList.remove('ic-calendar-scaled')
  const dayElements = calendarGraph.querySelectorAll(
    '.js-calendar-graph-table tbody td.ContributionCalendar-day[data-date]'
  )
  const byDate = new Map(
    [...dayElements].map((node) => [node.dataset.date, node])
  )
  for (const d of days) {
    const element = byDate.get(d.date.toISOString().slice(0, 10))
    if (element) {
      d.color = getSquareColor(element)
    }
  }
}

const readCalendarDays = (graph, getColorFn = getSquareColor) =>
  parseCalendarGraph(
    graph.querySelectorAll(
      '.js-calendar-graph-table tbody td.ContributionCalendar-day[data-date]'
    ),
    graph.querySelectorAll('tool-tip'),
    getColorFn
  )

const loadStats = () => {
  days = readCalendarDays(calendarGraph)
  weeks = Object.values(
    days.reduce((acc, day) => {
      const key = day.week
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(day)
      return acc
    }, {})
  )
  const currentWeekDays = weeks.at(-1)

  firstDay = days[0].date
  lastDay = days.find((d) => isToday(d.date))?.date ?? days.at(-1).date

  // Calculate streaks using pure function
  const stats = calculateStreaks(days)
  yearTotal = stats.yearTotal
  maxCount = stats.maxCount
  bestDay = stats.bestDay
  streakLongest = stats.streakLongest
  streakCurrent = stats.streakCurrent

  const firstDate = firstDay.toISOString().slice(0, 10)
  const canFetchHistoricalData = Boolean(getProfileUsername())
  const finalDay = days.at(-1)
  extendBackward = canFetchHistoricalData && days[0].count > 0
  // Only a past period can continue after its last day.
  extendForward =
    canFetchHistoricalData &&
    finalDay.date === lastDay &&
    finalDay.count > 0 &&
    finalDay.date.toISOString().slice(0, 10) < localDateKey()
  longestStreakLoading = extendBackward || extendForward
  currentStreakLoading =
    canFetchHistoricalData &&
    stats.currentStreakStart?.toISOString().slice(0, 10) === firstDate

  // Week total
  weekStartDay = currentWeekDays[0].date
  for (const d of currentWeekDays) {
    weekTotal += d.count
  }

  // Format current streak dates
  if (streakCurrent > 0) {
    datesCurrent = formatStreakDates(
      stats.currentStreakStart,
      stats.currentStreakEnd,
      streakCurrent
    )
  } else {
    datesCurrent = 'No current streak'
  }

  // Year total
  countTotal = yearTotal.toLocaleString()
  const dateLast = dateFormat.format(lastDay)
  datesTotal = `${dateFormat.format(firstDay)} → ${dateLast}`

  // Average contributions per day
  const dayDifference = datesDayDifference(firstDay, lastDay)
  averageCount = precisionRound(yearTotal / dayDifference, 2)

  // Best day
  dateBest = bestDay ? dateFormat.format(bestDay) : 'No activity found'

  // Longest streak
  if (streakLongest > 0) {
    datesLongest = formatStreakDates(
      stats.longestStreakStart,
      stats.longestStreakEnd,
      streakLongest
    )
  } else {
    datesLongest = 'No longest streak'
  }

  // Week total
  weekCountTotal = weekTotal.toLocaleString()
  const weekDateFirst = dateFormat.format(weekStartDay)
  weekDatesTotal = `${weekDateFirst} → ${dateLast}`
}

const renderIsometricChart = () => {
  const SIZE = 16
  const MAX_HEIGHT = 100
  const GH_OFFSET = 14
  const canvas = document.querySelector('#isometric-contributions')
  const scale = HEIGHT_SCALES[heightScale]
  canvas.setAttribute(
    'aria-label',
    `Contribution chart with ${scale.label.toLowerCase()} bar heights`
  )
  canvas.title = scale.description
  const scaleLabel = document.getElementById('ic-height-scale-label')
  scaleLabel.textContent = `Scale: ${scale.label}`
  scaleLabel.title = scale.description
  const point = new obelisk.Point(130, 90)
  const pixelView = new obelisk.PixelView(canvas, point)
  pixelView.clear()

  // Building a cube is the expensive part of a render, and many days share
  // a height and color (every empty day, for example).
  const cubes = new Map()
  let transform = GH_OFFSET

  for (const w of weeks) {
    const x = transform / (GH_OFFSET + 1)
    transform += GH_OFFSET
    let offsetY = 0 // Hardcode the old y of rect value.
    for (const d of w) {
      const y = offsetY / GH_OFFSET
      offsetY += 13
      const cubeHeight = contributionHeight(
        d.count,
        maxCount,
        heightScale,
        MAX_HEIGHT
      )

      const key = `${cubeHeight}:${d.color}`
      let cube = cubes.get(key)
      if (!cube) {
        const dimension = new obelisk.CubeDimension(SIZE, SIZE, cubeHeight)
        const color = new obelisk.CubeColor().getByHorizontalColor(
          Number.parseInt(d.color, 16)
        )
        cube = new obelisk.Cube(dimension, color, false)
        cubes.set(key, cube)
      }
      const p3d = new obelisk.Point3D(SIZE * x, SIZE * y, 0)
      pixelView.renderObject(cube, p3d)
    }
  }
}

// A hidden 3D view is redrawn when it is shown again, not on every change.
const renderCubes = () => {
  cubesStale = !views.includes('cubes')
  if (!cubesStale) renderIsometricChart()
}

const renderCharts = () => {
  renderCalendarIntensity(
    calendarGraph,
    days,
    maxCount,
    heightScale,
    palette.levels
  )
  renderCubes()
}

const renderStats = () => {
  const graphHeaderText =
    document.querySelector('.js-yearly-contributions h2')?.textContent ?? ''
  const viewingYear = /in \d{4}/.test(graphHeaderText)

  const contributionsStats = {
    countTotal,
    datesTotal,
    weekCountTotal,
    weekDatesTotal,
    maxCount,
    dateBest,
    averageCount
  }

  const streaksStats = {
    streakLongest,
    datesLongest,
    streakCurrent,
    datesCurrent
  }

  const topMarkup = generateContributionsMarkup(contributionsStats, {
    showWeek: !viewingYear,
    heightScale
  })
  const bottomMarkup = generateStreaksMarkup(streaksStats, {
    showCurrent: !viewingYear,
    loadingLongest: longestStreakLoading,
    loadingCurrent: currentStreakLoading
  })

  const cubesView = document.querySelector('.ic-cubes-view')
  const icStatsBlockTop = document.createElement('div')
  icStatsBlockTop.innerHTML = topMarkup
  cubesView.append(icStatsBlockTop)

  const icStatsBlockBottom = document.createElement('div')
  icStatsBlockBottom.innerHTML = bottomMarkup
  cubesView.append(icStatsBlockBottom)
}

const generateIsometricChart = () => {
  calendarGraph = document.querySelector('.js-calendar-graph')
  contributionsBox = document.querySelector('.js-yearly-contributions')

  resetValues()
  applyTheme()
  calendarGraph.classList.remove('ic-calendar-scaled')
  initUI()
  loadStats()
  renderStats()
  renderCharts()
  showLineView()
  restorePastYearScroll()

  extendStreakDataAndUpdate()
}

;(async () => {
  const initIfReady = () => {
    addPastYearLinks()
    themeContributionActivity()
    const graph = document.querySelector('.js-calendar-graph')
    if (!graph || document.querySelector('.ic-contributions-wrapper')) return
    // GitHub can insert the calendar before its count tooltips. Keep its native
    // colors until exact counts are available for both intensity and statistics.
    const sourceDays = readCalendarDays(graph, () => null)
    if (
      !sourceDays.length ||
      sourceDays.some((day) => !Number.isFinite(day.count))
    )
      return
    generateIsometricChart()
  }

  let observer = null

  const setupObserver = () => {
    cancelHistoryRequest()
    if (!document.querySelector('.vcard-names-container')) {
      return
    }

    document.querySelector('.ic-contributions-wrapper')?.remove()

    initIfReady()

    observer?.disconnect()
    const target = document.querySelector('main') || document.body
    // Skip batches made entirely inside the extension's own charts (such as
    // the line tooltip updating on every pointer move).
    observer = new MutationObserver((records) => {
      const ownChanges = records?.every((record) => {
        const node =
          record.target.nodeType === Node.ELEMENT_NODE
            ? record.target
            : record.target.parentElement
        return node?.closest('.ic-contributions-wrapper')
      })
      if (!ownChanges) initIfReady()
    })
    observer.observe(target, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-labelledby', 'for', 'id'],
      subtree: true
    })
  }

  await getSettings()

  const refreshTheme = () => {
    if (document.querySelector('.ic-contributions-wrapper')) {
      applyTheme()
      refreshColors()
      renderCharts()
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return
      if (changes.views) {
        setViews(normalizeViews(changes.views.newValue, legacyToggle))
      }
      if (changes.lineMode) {
        const nextMode = normalizeLineMode(changes.lineMode.newValue)
        if (nextMode !== lineMode) {
          lineMode = nextMode
          renderLineView()
        }
      }
      const nextScale = changes.heightScale
        ? normalizeHeightScale(changes.heightScale.newValue)
        : heightScale
      const nextColor = changes.contributionColor
        ? normalizeContributionColor(changes.contributionColor.newValue)
        : contributionColor
      if (heightScale === nextScale && contributionColor === nextColor) return
      heightScale = nextScale
      contributionColor = nextColor
      refreshTheme()
    })
  }

  colorScheme.addEventListener('change', refreshTheme)
  const themeObserver = new MutationObserver(refreshTheme)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-color-mode', 'data-light-theme', 'data-dark-theme']
  })

  setupObserver()
  document.addEventListener('turbo:load', setupObserver)
  document.addEventListener('visibilitychange', () => {
    // Storage and theme changes already redraw while hidden; only redraw on
    // return if the palette inputs changed without an event.
    if (
      document.visibilityState === 'visible' &&
      document.querySelector('.ic-contributions-wrapper') &&
      currentThemeKey() !== themeKey
    ) {
      refreshTheme()
    }
  })
})()
