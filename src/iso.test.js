/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchExtendedStreakData } from './history.js'
import {
  createContributionPalette,
  DEFAULT_CONTRIBUTION_COLOR
} from './palette.js'

vi.mock('./history.js', () => ({ fetchExtendedStreakData: vi.fn() }))

const day = (date, count = 1) => ({ date: new Date(date), count })
const showCalendar = (days) => {
  document.body.innerHTML = `
    <div class="vcard-names-container"></div>
    <main><section class="js-yearly-contributions">
      <h2>Contributions</h2><div><div class="js-calendar-graph">
        <table class="js-calendar-graph-table"><tbody><tr>${days
          .map(
            (d, i) =>
              `<td class="ContributionCalendar-day" data-date="${d.date.toISOString().slice(0, 10)}" data-level="${d.count === 0 ? 0 : Math.min(i + 1, 4)}" data-ix="0" aria-labelledby="tip-${i}" style="fill: rgb(0, 128, 0)"></td>`
          )
          .join('')}</tr></tbody></table>
        ${days.map((d, i) => `<tool-tip id="tip-${i}">${d.count} contributions on a day</tool-tip>`).join('')}
      </div></div>
      <div id="user-activity-overview">
        <svg class="js-activity-overview-graph" aria-label="Contribution types">
          <path class="js-highlight-blob" d="M 50 48 L 51 50 L 50 53 L 6 50 Z" fill="#40c463" stroke="#40c463" opacity="0.5" />
          <line class="activity-overview-axis" x1="0" y1="50" x2="100" y2="50" />
          <line class="activity-overview-axis" x1="50" y1="0" x2="50" y2="100" />
          <ellipse class="activity-overview-point" cx="6" cy="50" rx="3" ry="3" fill="white" />
          <text>94% Commits</text><text>3% Pull requests</text>
          <text>2% Code review</text><text>1% Issues</text>
        </svg>
      </div>
    </section><section id="js-contribution-activity" class="contribution-activity">
      <h2>Contribution activity</h2>
      <div class="Progress" role="img" aria-label="59% of commits">
        <span class="Progress-item rounded-2" style="width:59%;background-color:#30a14e"></span>
      </div>
      <span class="repo-language-color" style="background-color:#f1e05a"></span>
    </section></main>`
}

let onNavigate
let onThemeChange
let onSystemThemeChange
let onPageMutation
let systemTheme
const renderedHeights = []
const renderedColors = []
const clearChart = vi.fn(() => {
  renderedHeights.length = 0
  renderedColors.length = 0
})

beforeEach(() => {
  vi.resetModules()
  onNavigate = null
  onThemeChange = null
  onSystemThemeChange = null
  onPageMutation = null
  delete document.documentElement.dataset.colorMode
  localStorage.clear()
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (name, listener) => {
      if (name === 'turbo:load') onNavigate = listener
    }
  )
  systemTheme = {
    matches: false,
    addEventListener: (_event, listener) => {
      onSystemThemeChange = listener
    }
  }
  vi.stubGlobal('matchMedia', () => systemTheme)
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback) {
        this.callback = callback
      }
      observe(target) {
        if (target === document.documentElement) onThemeChange = this.callback
        else onPageMutation = this.callback
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
  'switches to %s and back while preserving counts and colors',
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
    const originalCalendar =
      document.querySelector('.js-calendar-graph').innerHTML
    const originalOverview = document.getElementById(
      'user-activity-overview'
    ).innerHTML
    expect(document.getElementById('ic-height-scale')).toBeNull()
    expect(canvas.getAttribute('aria-label')).toContain('linear')
    expect(scaleLabel.textContent).toBe('Scale: Linear')
    expect(clearChart).toHaveBeenCalledTimes(1)

    notify({ heightScale: { newValue: scale } })
    expect(renderedHeights).toEqual(heights)
    expect(clearChart).toHaveBeenCalledTimes(2)
    expect(canvas.getAttribute('aria-label')).toContain(label.toLowerCase())
    expect(canvas.title).not.toBe('')
    expect(scaleLabel.textContent).toBe(`Scale: ${label}`)
    expect(scaleLabel.title).toBe(canvas.title)
    expect(statValues()).toEqual(originalStats)
    expect(document.querySelector('.js-calendar-graph').innerHTML).toBe(
      originalCalendar
    )
    expect(document.getElementById('user-activity-overview').innerHTML).toBe(
      originalOverview
    )

    notify({ heightScale: { newValue: 'linear' } })
    expect(renderedHeights).toEqual([3, 4, 103])
    expect(clearChart).toHaveBeenCalledTimes(3)
    expect(canvas.getAttribute('aria-label')).toContain('linear')
    expect(scaleLabel.textContent).toBe('Scale: Linear')
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
    expect(
      document.querySelector('.js-yearly-contributions').classList
    ).toContain('ic-both')
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

const expectPalette = (color, dark = false) => {
  const palette = createContributionPalette(color, dark)
  const box = document.querySelector('.js-yearly-contributions')
  palette.levels.forEach((shade, level) => {
    expect(box.style.getPropertyValue(`--ic-level-${level}`)).toBe(shade)
  })
  expect(box.style.getPropertyValue('--ic-accent')).toBe(palette.accent)
  const activity = document.getElementById('js-contribution-activity')
  expect(activity.classList).toContain('ic-activity-themed')
  expect(activity.style.getPropertyValue('--ic-accent')).toBe(palette.accent)
  expect(renderedColors).toEqual(
    [0, 2, 3].map((level) =>
      Number.parseInt(palette.levels[level].slice(1), 16)
    )
  )
}

it.each(
  ['squares', 'cubes', 'both'].flatMap((view) =>
    ['linear', 'square-root', 'logarithmic'].map((scale) => [view, scale])
  )
)(
  'updates colors in %s with %s heights without changing any contribution data',
  async (view, scale) => {
    const notify = mockChromeStorage({
      toggleSetting: view,
      heightScale: scale
    })
    showCalendar(outlierCalendar())
    const originalCalendar =
      document.querySelector('.js-calendar-graph').innerHTML
    const originalOverview = document.getElementById(
      'user-activity-overview'
    ).innerHTML
    const originalActivity = document.getElementById(
      'js-contribution-activity'
    ).innerHTML
    await import('./iso.js')
    await vi.waitFor(() => expect(renderedColors).toHaveLength(3))
    expectPalette(DEFAULT_CONTRIBUTION_COLOR)
    const originalHeights = [...renderedHeights]
    const originalStats = document.querySelector(
      '.ic-contributions-wrapper'
    ).textContent
    notify({ contributionColor: { newValue: '#d040a0' } })
    expectPalette('#d040a0')
    expect(document.getElementById('user-activity-overview').innerHTML).toBe(
      originalOverview
    )
    expect(document.getElementById('js-contribution-activity').innerHTML).toBe(
      originalActivity
    )
    expect(renderedHeights).toEqual(originalHeights)
    expect(document.querySelector('.js-calendar-graph').innerHTML).toBe(
      originalCalendar
    )
    expect(
      document.querySelector('.ic-contributions-wrapper').textContent
    ).toBe(originalStats)
    expect(
      document.querySelector('.js-yearly-contributions').classList
    ).toContain(`ic-${view}`)
    notify({ contributionColor: { oldValue: '#d040a0' } })
    expectPalette(DEFAULT_CONTRIBUTION_COLOR)
    expect(document.getElementById('user-activity-overview').innerHTML).toBe(
      originalOverview
    )
    expect(document.getElementById('js-contribution-activity').innerHTML).toBe(
      originalActivity
    )
  }
)

it('themes a timeline loaded after the calendar and preserves appended activity data', async () => {
  const notify = mockChromeStorage({ contributionColor: '#aa00cc' })
  showCalendar(outlierCalendar())
  const timeline = document.getElementById('js-contribution-activity')
  const originalActivity = timeline.innerHTML
  timeline.remove()
  await import('./iso.js')
  await vi.waitFor(() => expect(onPageMutation).toBeTypeOf('function'))
  document.querySelector('main').append(timeline)
  onPageMutation()
  expectPalette('#aa00cc')
  const bar = timeline.querySelector('.Progress').cloneNode(true)
  bar.setAttribute('aria-label', '1% of commits')
  bar.firstElementChild.style.width = '1%'
  timeline.append(bar)
  const appendedMarkup = timeline.innerHTML
  onPageMutation()
  notify({ contributionColor: { newValue: '#ee8800' } })
  expectPalette('#ee8800')
  expect(timeline.innerHTML).toBe(appendedMarkup)
  expect(timeline.innerHTML).toContain(originalActivity)
})

it.each(['localStorage', 'chrome.storage.local'])(
  'restores the %s color after reloads, profile changes, and year changes',
  async (storageType) => {
    if (storageType === 'localStorage') {
      localStorage.setItem('contributionColor', '#ad3050')
    } else {
      mockChromeStorage({ contributionColor: '#ad3050' })
    }
    showCalendar(outlierCalendar())
    await import('./iso.js')
    await vi.waitFor(() => expect(renderedColors).toHaveLength(3))
    expectPalette('#ad3050')
    for (const location of ['/new-profile', '/new-profile?from=2023-01-01']) {
      window.history.replaceState(null, '', location)
      showCalendar(outlierCalendar())
      onNavigate()
      expectPalette('#ad3050')
    }
  }
)

it('updates an existing chart for GitHub theme changes and system theme changes', async () => {
  mockChromeStorage({ contributionColor: '#ffff00' })
  showCalendar(outlierCalendar())
  await import('./iso.js')
  await vi.waitFor(() => expect(renderedColors).toHaveLength(3))
  const heights = [...renderedHeights]
  const stats = document.querySelector('.ic-contributions-wrapper').textContent
  document.documentElement.dataset.colorMode = 'dark'
  onThemeChange()
  expectPalette('#ffff00', true)
  document.documentElement.dataset.colorMode = 'light'
  systemTheme.matches = true
  onSystemThemeChange()
  expectPalette('#ffff00', false)
  document.documentElement.dataset.colorMode = 'auto'
  onThemeChange()
  expectPalette('#ffff00', true)
  expect(renderedHeights).toEqual(heights)
  expect(document.querySelector('.ic-contributions-wrapper').textContent).toBe(
    stats
  )
})

it('remembers color changes without a chart and ignores invalid or unrelated updates', async () => {
  const notify = mockChromeStorage()
  await import('./iso.js')
  await vi.waitFor(() => expect(onNavigate).toBeTypeOf('function'))
  notify({ contributionColor: { newValue: '#aa00cc' } })
  showCalendar(outlierCalendar())
  onNavigate()
  expectPalette('#aa00cc')
  notify({ contributionColor: { newValue: '#ff0000' } }, 'sync')
  expectPalette('#aa00cc')
  notify({ contributionColor: { newValue: 'invalid' } })
  expectPalette(DEFAULT_CONTRIBUTION_COLOR)
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
