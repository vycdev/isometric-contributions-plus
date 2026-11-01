/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { intensityColor } from './calendar.js'
import { fetchExtendedStreakData } from './history.js'
import { contributionIntensity } from './utils.js'

vi.mock('./history.js', () => ({ fetchExtendedStreakData: vi.fn() }))

const NativeMutationObserver = globalThis.MutationObserver
const nativeObservers = []

const day = (date, count = 1) => ({ date: new Date(date), count })
const showCalendar = (days) => {
  document.body.innerHTML = `
    <style>
      .ContributionCalendar-day[data-level="0"] { fill: rgb(235, 237, 240); }
      .ContributionCalendar-day[data-level="1"] { fill: rgb(155, 233, 168); }
      .ContributionCalendar-day[data-level="2"] { fill: rgb(64, 196, 99); }
      .ContributionCalendar-day[data-level="3"] { fill: rgb(48, 161, 78); }
      .ContributionCalendar-day[data-level="4"] { fill: rgb(33, 110, 57); }
    </style>
    <div class="vcard-names-container"></div>
    <main><section class="js-yearly-contributions">
      <h2>Contributions</h2><div><div class="js-calendar-graph">
        <table class="js-calendar-graph-table"><tbody><tr>${days
          .map(
            (d, i) =>
              `<td class="ContributionCalendar-day" data-date="${d.date.toISOString().slice(0, 10)}" data-level="${d.count > 0 ? 4 : 0}" data-ix="0" aria-labelledby="tip-${i}" style="width: 10px;"></td>`
          )
          .join('')}</tr></tbody></table>
        ${days.map((d, i) => `<tool-tip id="tip-${i}">${d.count} contributions on a day</tool-tip>`).join('')}
      </div></div>
    </section></main>`
}

let onNavigate
let onThemeChange
let onColorSchemeChange
let onCalendarChange
const renderedHeights = []
const renderedColors = []
const clearChart = vi.fn(() => {
  renderedHeights.length = 0
  renderedColors.length = 0
})

beforeEach(() => {
  vi.resetModules()
  onNavigate = null
  localStorage.clear()
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (name, listener) => {
      if (name === 'turbo:load') onNavigate = listener
    }
  )
  vi.stubGlobal('matchMedia', () => ({
    addEventListener(_name, listener) {
      onColorSchemeChange = listener
    }
  }))
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback) {
        this.callback = callback
      }
      observe(target) {
        if (target === document.documentElement) onThemeChange = this.callback
        else onCalendarChange = this.callback
      }
      disconnect() {}
    }
  )
  vi.stubGlobal('obelisk', {
    Point: class {},
    Point3D: class {},
    PixelView: class {
      clear = clearChart
      renderObject() {}
    },
    CubeDimension: class {
      constructor(_x, _y, height) {
        renderedHeights.push(height)
      }
    },
    CubeColor: class {
      getByHorizontalColor(color) {
        renderedColors.push(color)
        return 0
      }
    },
    Cube: class {}
  })
  window.history.replaceState(null, '', '/old-profile')
})

afterEach(() => {
  for (const observer of nativeObservers.splice(0)) observer.disconnect()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

const outlierCalendar = () => [
  day('2024-01-01', 0),
  day('2024-01-02', 10),
  day('2024-01-03', 609)
]

const palette = [
  'rgb(235, 237, 240)',
  'rgb(155, 233, 168)',
  'rgb(64, 196, 99)',
  'rgb(48, 161, 78)',
  'rgb(33, 110, 57)'
]
const calendarColors = () =>
  [...document.querySelectorAll('td.ContributionCalendar-day')].map((element) =>
    element.style.getPropertyValue('--ic-intensity-color')
  )
const expectedColors = (scale, counts = [0, 10, 609]) =>
  counts.map((count) =>
    intensityColor(
      contributionIntensity(count, Math.max(...counts), scale),
      palette
    )
  )

const mockChromeStorage = (settings = {}) => {
  let onChanged
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (_keys, callback) => callback(settings),
        set: vi.fn()
      },
      onChanged: {
        addListener: (listener) => {
          onChanged = listener
        }
      }
    }
  })
  return (changes, area = 'local') => onChanged(changes, area)
}

it.each([
  ['square-root', 'Square root', [3, 15, 103]],
  ['logarithmic', 'Logarithmic', [3, 40, 103]]
])(
  'switches to %s and back while preserving counts and 3D colors',
  async (scale, label, heights) => {
    const notify = mockChromeStorage()
    showCalendar(outlierCalendar())
    await import('./iso.js')
    await vi.waitFor(() => expect(renderedHeights).toEqual([3, 4, 103]))

    const canvas = document.getElementById('isometric-contributions')
    const stats = document.querySelector('.ic-contributions-wrapper > div')
    const scaleLabel = document.getElementById('ic-height-scale-label')
    const statValues = () =>
      [...stats.querySelectorAll('span:not(#ic-height-scale-label)')].map(
        (span) => span.textContent
      )
    const originalStats = statValues()
    const originalColors = [...renderedColors]
    const originalTooltips = [...document.querySelectorAll('tool-tip')].map(
      (element) => element.outerHTML
    )
    const originalDayData = [
      ...document.querySelectorAll('td.ContributionCalendar-day')
    ].map((element) => ({ ...element.dataset }))
    expect(calendarColors()).toEqual(expectedColors('linear'))
    expect(document.getElementById('ic-height-scale')).toBeNull()
    expect(canvas.getAttribute('aria-label')).toContain('linear')
    expect(scaleLabel.textContent).toBe('Scale: Linear')
    expect(clearChart).toHaveBeenCalledTimes(1)

    notify({ heightScale: { newValue: scale } })
    expect(renderedHeights).toEqual(heights)
    expect(renderedColors).toEqual(originalColors)
    expect(clearChart).toHaveBeenCalledTimes(2)
    expect(canvas.getAttribute('aria-label')).toContain(label.toLowerCase())
    expect(canvas.title).not.toBe('')
    expect(scaleLabel.textContent).toBe(`Scale: ${label}`)
    expect(scaleLabel.title).toBe(canvas.title)
    expect(statValues()).toEqual(originalStats)
    expect(calendarColors()).toEqual(expectedColors(scale))
    expect(
      [...document.querySelectorAll('tool-tip')].map(
        (element) => element.outerHTML
      )
    ).toEqual(originalTooltips)
    expect(
      [...document.querySelectorAll('td.ContributionCalendar-day')].map(
        (element) => ({ ...element.dataset })
      )
    ).toEqual(originalDayData)
    expect(
      document.getElementById('ic-calendar-scale-label').textContent
    ).toContain(`Scale: ${label}`)

    notify({ heightScale: { newValue: 'linear' } })
    expect(renderedHeights).toEqual([3, 4, 103])
    expect(renderedColors).toEqual(originalColors)
    expect(clearChart).toHaveBeenCalledTimes(3)
    expect(canvas.getAttribute('aria-label')).toContain('linear')
    expect(scaleLabel.textContent).toBe('Scale: Linear')
    expect(calendarColors()).toEqual(expectedColors('linear'))
  }
)

it.each([
  ['localStorage', 'square-root', [3, 15, 103]],
  ['chrome.storage.local', 'square-root', [3, 15, 103]],
  ['localStorage', 'logarithmic', [3, 40, 103]],
  ['chrome.storage.local', 'logarithmic', [3, 40, 103]]
])(
  'restores a %s preference for %s and keeps it after navigation',
  async (storageType, scale, heights) => {
    if (storageType === 'chrome.storage.local') {
      mockChromeStorage({ heightScale: scale, toggleSetting: 'both' })
    } else {
      localStorage.setItem('heightScale', scale)
      localStorage.setItem('toggleSetting', 'both')
    }
    showCalendar(outlierCalendar())
    await import('./iso.js')
    await vi.waitFor(() => expect(renderedHeights).toEqual(heights))
    expect(calendarColors()).toEqual(expectedColors(scale))
    expect(
      document
        .getElementById('isometric-contributions')
        .getAttribute('aria-label')
    ).toContain(scale.replace('-', ' '))
    expect(
      document.querySelector('.js-yearly-contributions').classList
    ).toContain('ic-both')

    window.history.replaceState(null, '', '/new-profile')
    showCalendar(outlierCalendar())
    onNavigate()
    expect(renderedHeights).toEqual(heights)
    expect(calendarColors()).toEqual(expectedColors(scale))
    expect(
      document.querySelector('.js-yearly-contributions').classList
    ).toContain('ic-both')
  }
)

it.each(['squares', 'both'])(
  'updates 2D intensity immediately in %s mode and retains it across view changes',
  async (view) => {
    const notify = mockChromeStorage({ toggleSetting: view })
    showCalendar(outlierCalendar())
    await import('./iso.js')
    await vi.waitFor(() =>
      expect(calendarColors()).toEqual(expectedColors('linear'))
    )
    notify({ heightScale: { newValue: 'logarithmic' } })
    expect(calendarColors()).toEqual(expectedColors('logarithmic'))
    expect(
      document.querySelector('.js-yearly-contributions').classList
    ).toContain(`ic-${view}`)
    for (const mode of ['cubes', 'squares', 'both']) {
      document.querySelector(`[data-ic-option="${mode}"]`).click()
      expect(calendarColors()).toEqual(expectedColors('logarithmic'))
    }
  }
)

it.each(['linear', 'square-root', 'logarithmic'])(
  '%s keeps an empty year neutral and a one-contribution year at maximum',
  async (scale) => {
    mockChromeStorage({ heightScale: scale })
    showCalendar([day('2024-01-01', 0), day('2024-12-31', 0)])
    await import('./iso.js')
    await vi.waitFor(() =>
      expect(calendarColors()).toEqual([palette[0], palette[0]])
    )
    expect(
      document.getElementById('ic-calendar-scale-label').textContent
    ).toContain('Peak: 0/day')
    showCalendar([day('2023-01-01', 0), day('2023-12-31', 1)])
    window.history.replaceState(null, '', '/new-profile?from=2023-01-01')
    onNavigate()
    expect(calendarColors()).toEqual([palette[0], palette[4]])
    expect(renderedHeights).toEqual([3, 103])
  }
)

it('resamples palette colors on GitHub theme and system theme changes', async () => {
  mockChromeStorage({ heightScale: 'square-root' })
  showCalendar(outlierCalendar())
  await import('./iso.js')
  await vi.waitFor(() =>
    expect(calendarColors()).toEqual(expectedColors('square-root'))
  )
  const darkPalette = [
    'rgb(22, 27, 34)',
    'rgb(14, 68, 41)',
    'rgb(0, 109, 50)',
    'rgb(38, 166, 65)',
    'rgb(57, 211, 83)'
  ]
  const theme = document.createElement('style')
  theme.textContent = darkPalette
    .map(
      (color, level) =>
        `.ContributionCalendar-day[data-level="${level}"] { fill: ${color}; }`
    )
    .join('')
  document.body.append(theme)
  onThemeChange()
  const darkColors = [0, 10, 609].map((count) =>
    intensityColor(
      contributionIntensity(count, 609, 'square-root'),
      darkPalette
    )
  )
  expect(calendarColors()).toEqual(darkColors)
  expect(renderedColors).toEqual([0x161b22, 0x39d353, 0x39d353])
  onColorSchemeChange()
  expect(calendarColors()).toEqual(darkColors)
  expect(renderedColors).toEqual([0x161b22, 0x39d353, 0x39d353])
  theme.remove()
  onThemeChange()
  expect(calendarColors()).toEqual(expectedColors('square-root'))
})

it('can reinitialize the same calendar without sampling scaled 2D colors for 3D', async () => {
  mockChromeStorage({ heightScale: 'logarithmic' })
  showCalendar(outlierCalendar())
  await import('./iso.js')
  await vi.waitFor(() =>
    expect(calendarColors()).toEqual(expectedColors('logarithmic'))
  )
  const originalColors = [...renderedColors]
  onNavigate()
  expect(renderedColors).toEqual(originalColors)
  expect(calendarColors()).toEqual(expectedColors('logarithmic'))
  expect(document.querySelectorAll('#ic-calendar-scale-label')).toHaveLength(1)
})

it.each(['missing', 'loading'])(
  'waits for exact counts before scaling a calendar with a %s tooltip',
  async (state) => {
    mockChromeStorage({ heightScale: 'square-root' })
    showCalendar(outlierCalendar())
    const tooltip = document.getElementById('tip-1')
    if (state === 'missing') tooltip.remove()
    else tooltip.textContent = 'Loading...'
    await import('./iso.js')
    await vi.waitFor(() => expect(onNavigate).toBeTypeOf('function'))
    expect(document.querySelector('.ic-contributions-wrapper')).toBeNull()
    expect(
      document.querySelector('.js-calendar-graph').classList
    ).not.toContain('ic-calendar-scaled')

    tooltip.textContent = '10 contributions on January 2nd.'
    if (state === 'missing')
      document.querySelector('.js-calendar-graph').append(tooltip)
    onCalendarChange()
    expect(calendarColors()).toEqual(expectedColors('square-root'))
    expect(
      document.querySelector('.ic-contributions-wrapper .f2').textContent
    ).toBe('619')
  }
)

it.each(['text', 'association'])(
  'initializes through real DOM observations after delayed tooltip %s hydration',
  async (hydration) => {
    vi.stubGlobal(
      'MutationObserver',
      class extends NativeMutationObserver {
        constructor(callback) {
          super(callback)
          nativeObservers.push(this)
        }
      }
    )
    mockChromeStorage({ heightScale: 'logarithmic' })
    showCalendar(outlierCalendar())
    const tooltip = document.getElementById('tip-1')
    const element = document.querySelector('[data-date="2024-01-02"]')
    if (hydration === 'text') tooltip.textContent = 'Loading...'
    else element.removeAttribute('aria-labelledby')
    await import('./iso.js')
    await vi.waitFor(() => expect(onNavigate).toBeTypeOf('function'))
    expect(document.querySelector('.ic-contributions-wrapper')).toBeNull()
    if (hydration === 'text')
      tooltip.firstChild.data = '10 contributions on January 2nd.'
    else element.setAttribute('aria-labelledby', tooltip.id)
    await vi.waitFor(() =>
      expect(calendarColors()).toEqual(expectedColors('logarithmic'))
    )
    // The renderer's own legend, style, and accessibility mutations must settle.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(clearChart).toHaveBeenCalledTimes(1)
  }
)

it('falls back to linear for an unrecognized stored height scale', async () => {
  localStorage.setItem('heightScale', 'unknown')
  showCalendar(outlierCalendar())
  await import('./iso.js')
  await vi.waitFor(() => expect(renderedHeights).toEqual([3, 4, 103]))
  expect(
    document
      .getElementById('isometric-contributions')
      .getAttribute('aria-label')
  ).toContain('linear')
})

it('ignores unrelated storage changes and resets a removed setting to linear', async () => {
  const notify = mockChromeStorage({ heightScale: 'square-root' })
  showCalendar(outlierCalendar())
  await import('./iso.js')
  await vi.waitFor(() => expect(renderedHeights).toEqual([3, 15, 103]))
  notify({ heightScale: { newValue: 'logarithmic' } }, 'sync')
  notify({ toggleSetting: { newValue: 'squares' } })
  notify({ heightScale: { newValue: 'square-root' } })
  expect(clearChart).toHaveBeenCalledTimes(1)
  notify({ heightScale: { oldValue: 'square-root' } })
  expect(renderedHeights).toEqual([3, 4, 103])
})

it('remembers changes made while no chart is present for the next profile', async () => {
  const notify = mockChromeStorage()
  await import('./iso.js')
  await vi.waitFor(() => expect(onNavigate).toBeTypeOf('function'))
  expect(() =>
    notify({ heightScale: { newValue: 'logarithmic' } })
  ).not.toThrow()
  showCalendar(outlierCalendar())
  onNavigate()
  expect(renderedHeights).toEqual([3, 40, 103])
})

it.each(['another profile', 'another year on the same profile'])(
  'ignores a delayed historical response after navigating to %s',
  async (destination) => {
    const oldDays = [day('2024-01-01'), day('2024-01-02')]
    showCalendar(oldDays)
    let resolveOld
    let resolveNew
    fetchExtendedStreakData
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve
          })
      )

    await import('./iso.js')
    await vi.waitFor(() =>
      expect(fetchExtendedStreakData).toHaveBeenCalledTimes(1)
    )
    const oldSignal = fetchExtendedStreakData.mock.calls[0][3]
    window.history.replaceState(
      null,
      '',
      destination === 'another profile'
        ? '/new-profile'
        : '/old-profile?tab=overview&from=2023-01-01'
    )
    const newDays = [day('2023-01-01')]
    showCalendar(newDays)
    onNavigate()
    expect(oldSignal.aborted).toBe(true)
    expect(fetchExtendedStreakData).toHaveBeenCalledTimes(2)

    resolveNew(newDays)
    await vi.waitFor(() =>
      expect(
        document.getElementById('ic-streak-longest-count').textContent
      ).toBe('1 days')
    )
    resolveOld([day('2023-12-31'), ...oldDays])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.getElementById('ic-streak-longest-count').textContent).toBe(
      '1 days'
    )
    expect(document.getElementById('ic-streak-longest-dates').textContent).toBe(
      'Jan 1 → Jan 1'
    )
  }
)

const boundaryCalendar = (firstDayActive = true) =>
  Array.from({ length: 20 }, (_, i) =>
    day(
      `2024-01-${String(i + 1).padStart(2, '0')}`,
      (i < 5 && (i > 0 || firstDayActive)) || i >= 10 ? 1 : 0
    )
  )

it('extends a shorter boundary streak that can exceed the visible longest', async () => {
  const current = boundaryCalendar()
  const historical = Array.from({ length: 100 }, (_, i) => ({
    date: new Date(Date.UTC(2023, 8, 23 + i)),
    count: 1
  }))
  showCalendar(current)
  fetchExtendedStreakData.mockResolvedValueOnce([...historical, ...current])
  await import('./iso.js')
  await vi.waitFor(() =>
    expect(document.getElementById('ic-streak-longest-count').textContent).toBe(
      '105 days'
    )
  )
  expect(fetchExtendedStreakData).toHaveBeenCalledTimes(1)
  expect(document.getElementById('ic-streak-current-count').textContent).toBe(
    '10 days'
  )
})

it('skips historical requests when the first visible day is inactive', async () => {
  showCalendar(boundaryCalendar(false))
  await import('./iso.js')
  await vi.waitFor(() =>
    expect(document.getElementById('ic-streak-longest-count').textContent).toBe(
      '10 days'
    )
  )
  expect(fetchExtendedStreakData).not.toHaveBeenCalled()
})
