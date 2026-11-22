/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContributionPalette } from './palette.js'
import {
  addPastYearLinks,
  isPastYearView,
  loadPastYear,
  restorePastYearScroll,
  STALE,
  themeYearList
} from './years.js'

// Mirrors GitHub's markup: a hidden mobile list and the sticky desktop list.
const yearList = (selected = '2026') => `
  <div class="d-lg-none js-profile-timeline-year-list"></div>
  <div class="js-profile-timeline-year-list position-sticky" style="top: 74px;">
    <ol class="filter-list small" role="list">
      ${['2026', '2025', '2024']
        .map(
          (year) =>
            `<li><a id="year-link-${year}" class="js-year-link filter-item tmp-px-3 mb-2 py-2${year === selected ? ' selected" aria-current="true' : ''}" data-turbo="false" href="/someone?tab=overview&from=${year}-12-01&to=${year}-12-31">${year}</a></li>`
        )
        .join('')}
    </ol>
  </div>`
const heading = (period) =>
  `<div class="js-yearly-contributions"><h2>1,234 contributions in ${period}</h2></div>`
const at = (pathname, search = '') => ({ pathname, search })
// GitHub's own click handler for year links (profile bundle, simplified).
const githubSwitchYear = (target) => {
  const previous = target
    .closest('.js-profile-timeline-year-list')
    .querySelector('.js-year-link.selected')
  previous.classList.remove('selected')
  target.classList.add('selected')
  previous.removeAttribute('aria-current')
  target.setAttribute('aria-current', 'true')
}
const items = () =>
  [...document.querySelectorAll('.filter-list a')].map((link) => ({
    text: link.textContent,
    selected: link.classList.contains('selected'),
    current: link.getAttribute('aria-current')
  }))

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = heading('the last year') + yearList()
})

it.each([
  ['12 contributions in the last year', '?from=2025-12-01', true],
  ['12 contributions in 2025', '', false],
  [undefined, '?tab=overview', true],
  [undefined, '?tab=overview&from=2025-12-01&to=2025-12-31', false]
])(
  'treats heading %j with %j as the past-year view: %s',
  (text, search, expected) => {
    expect(isPastYearView(text, search)).toBe(expected)
  }
)

describe('addPastYearLinks', () => {
  it('adds a selected Past year link on the default view', () => {
    addPastYearLinks(at('/someone', '?tab=overview'))
    expect(items()).toEqual([
      { text: 'Past year', selected: true, current: 'true' },
      // GitHub's own selection is kept for its scripts, but not announced.
      { text: '2026', selected: true, current: 'false' },
      { text: '2025', selected: false, current: null },
      { text: '2024', selected: false, current: null }
    ])
    const link = document.querySelector('.ic-past-year')
    expect(link.getAttribute('href')).toBe('/someone')
    expect(link.dataset.turbo).toBe('false')
    expect(link.classList).not.toContain('js-year-link')
    expect([...link.classList]).toEqual(
      expect.arrayContaining(['filter-item', 'tmp-px-3', 'mb-2', 'py-2'])
    )
    expect(link.getAttribute('aria-label')).toContain('past 12 months')
  })

  it('leaves GitHub’s selected year alone when a year is chosen', () => {
    document.body.innerHTML = heading('2025') + yearList('2025')
    addPastYearLinks(at('/someone', '?tab=overview&from=2025-12-01'))
    expect(items()).toEqual([
      { text: 'Past year', selected: false, current: null },
      { text: '2026', selected: false, current: null },
      { text: '2025', selected: true, current: 'true' },
      { text: '2024', selected: false, current: null }
    ])
  })

  it('keeps GitHub’s in-page year switching working', () => {
    addPastYearLinks(at('/someone'))
    const year2025 = document.getElementById('year-link-2025')
    expect(() => githubSwitchYear(year2025)).not.toThrow()
    // GitHub then swaps in the 2025 graph before updating the URL.
    document.querySelector('.js-yearly-contributions h2').textContent =
      '99 contributions in 2025'
    addPastYearLinks(at('/someone'))
    expect(items()).toEqual([
      { text: 'Past year', selected: false, current: null },
      { text: '2026', selected: false, current: null },
      { text: '2025', selected: true, current: 'true' },
      { text: '2024', selected: false, current: null }
    ])
  })

  it('adds one link per list, however often the page changes', () => {
    for (let i = 0; i < 3; i++) addPastYearLinks(at('/someone'))
    expect(document.querySelectorAll('.ic-past-year')).toHaveLength(1)
    // A list GitHub re-renders later gets its own link.
    document.body.insertAdjacentHTML('beforeend', yearList())
    addPastYearLinks(at('/someone'))
    expect(document.querySelectorAll('.ic-past-year')).toHaveLength(2)
  })

  it('ignores pages without a year list', () => {
    document.body.innerHTML = `${heading('the last year')}<ol class="filter-list"></ol>`
    expect(() => addPastYearLinks(at('/someone'))).not.toThrow()
    expect(document.querySelector('.ic-past-year')).toBeNull()
  })
})

describe('themeYearList', () => {
  const css = () => document.getElementById('ic-year-list-theme').textContent

  it('colors the selected year from a stylesheet GitHub cannot overwrite', () => {
    const palette = createContributionPalette('#ff00bb', true)
    themeYearList(palette)
    expect(css()).toContain(`background-color: ${palette.emphasis} !important`)
    expect(css()).toContain(`outline: 2px solid ${palette.accent}`)
    // GitHub's still-selected year is un-highlighted while Past year is shown.
    expect(css()).toContain(
      '.filter-list:has(.ic-past-year.selected) .js-year-link.selected'
    )
    // The list's own inline style is untouched.
    expect(
      document
        .querySelectorAll('.js-profile-timeline-year-list')[1]
        .getAttribute('style')
    ).toBe('top: 74px;')
  })

  it('updates one stylesheet and restores it if navigation removes it', () => {
    themeYearList(createContributionPalette('#ff00bb'))
    const next = createContributionPalette('#00aa55')
    themeYearList(next)
    expect(document.querySelectorAll('#ic-year-list-theme')).toHaveLength(1)
    expect(css()).toContain(next.emphasis)
    document.head.innerHTML = ''
    themeYearList(next)
    expect(css()).toContain(next.emphasis)
  })
})

const graphFragment = (period) =>
  `<div class="js-yearly-contributions"><h2 id="js-contribution-activity-description" tabindex="-1">5 contributions in ${period}</h2><div class="js-calendar-graph" data-graph-url="/users/someone/contributions" data-url="/someone"></div></div>`
const profile = () => {
  document.body.innerHTML = `${graphFragment('2025').replace('data-graph-url="/users/someone/contributions"', 'data-graph-url="/users/someone/contributions?from=2025-12-01&amp;to=2025-12-31"')}
    ${yearList('2025')}
    <div id="js-contribution-activity"><p>2025 activity</p></div>`
  addPastYearLinks(at('/someone', '?tab=overview&from=2025-12-01'))
}
const htmlResponse = (html) => ({ ok: true, text: async () => html })

describe('loading Past year in place', () => {
  const fakeWindow = (fetch) => ({
    location: { origin: 'https://github.com', pathname: '/someone' },
    fetch,
    history: { pushState: vi.fn() },
    crypto: { randomUUID: () => 'fresh-id' },
    sessionStorage
  })

  beforeEach(profile)
  afterEach(() => vi.restoreAllMocks())

  it('swaps in the unfiltered graph and activity like GitHub’s year links', async () => {
    const fetch = vi.fn(async (url) =>
      htmlResponse(
        String(url).includes('/users/')
          ? graphFragment('the last year')
          : '<p>Past year activity</p>'
      )
    )
    const win = fakeWindow(fetch)
    expect(await loadPastYear(document, win)).toBe(true)

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://github.com/users/someone/contributions',
      'https://github.com/someone?tab=overview'
    ])
    for (const [, options] of fetch.mock.calls) {
      expect(options.headers['X-Requested-With']).toBe('XMLHttpRequest')
    }
    expect(
      document.querySelector('.js-yearly-contributions h2').textContent
    ).toBe('5 contributions in the last year')
    expect(
      document.getElementById('js-contribution-activity').textContent
    ).toBe('Past year activity')
    expect(
      document.getElementById('js-contribution-activity').classList
    ).not.toContain('loading')
    expect(win.history.pushState).toHaveBeenCalledWith(
      { turbo: { restorationIdentifier: 'fresh-id' }, turboCount: 0 },
      '',
      '/someone'
    )
    // GitHub's selection moves to the current year, as on the default page.
    addPastYearLinks(at('/someone'))
    expect(items()).toEqual([
      { text: 'Past year', selected: true, current: 'true' },
      { text: '2026', selected: true, current: 'false' },
      { text: '2025', selected: false, current: null },
      { text: '2024', selected: false, current: null }
    ])
  })

  it('discards the result if the page changed while loading', async () => {
    const pending = []
    const respond = () => {
      for (const resolve of pending) {
        resolve(htmlResponse(graphFragment('the last year')))
      }
    }
    const fetch = vi.fn(() => new Promise((resolve) => pending.push(resolve)))
    const win = fakeWindow(fetch)
    const loading = loadPastYear(document, win)
    // Meanwhile GitHub switches to 2023 in place.
    document
      .querySelector('.js-yearly-contributions')
      .replaceWith(
        document.createRange().createContextualFragment(graphFragment('2023'))
      )
    respond()
    expect(await loading).toBe(STALE)
    expect(
      document.querySelector('.js-yearly-contributions h2').textContent
    ).toContain('in 2023')
    expect(win.history.pushState).not.toHaveBeenCalled()
  })

  it('still switches in place after Turbo restores a cloned list', async () => {
    const fetch = vi.fn(async (url) =>
      htmlResponse(
        String(url).includes('/users/')
          ? graphFragment('the last year')
          : '<p>Past year activity</p>'
      )
    )
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(window.history, 'pushState')
    // A clone keeps the Past year link but not listeners attached to it.
    document.body.replaceWith(document.body.cloneNode(true))
    addPastYearLinks(at('/someone', '?from=2025-12-01'))
    expect(document.querySelectorAll('.ic-past-year')).toHaveLength(1)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.querySelector('.ic-past-year').dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(window.history.pushState).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })

  it('leaves the page unchanged when a request fails', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    const win = fakeWindow(fetch)
    await expect(loadPastYear(document, win)).rejects.toThrow('500')
    expect(
      document.querySelector('.js-yearly-contributions h2').textContent
    ).toContain('in 2025')
    expect(
      document.getElementById('js-contribution-activity').classList
    ).not.toContain('loading')
    expect(win.history.pushState).not.toHaveBeenCalled()
  })

  it('switches without navigating when Past year is clicked', async () => {
    const fetch = vi.fn(async (url) =>
      htmlResponse(
        String(url).includes('/users/')
          ? graphFragment('the last year')
          : '<p>Past year activity</p>'
      )
    )
    vi.stubGlobal('fetch', fetch)
    const pushState = vi.spyOn(window.history, 'pushState')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.querySelector('.ic-past-year').dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(pushState).toHaveBeenCalled())
    expect(window.location.pathname).toBe('/someone')
    expect(sessionStorage.getItem('ic-past-year-scroll')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('full page load fallback', () => {
  const boxTop = (top) =>
    vi
      .spyOn(
        document.querySelector('.js-yearly-contributions'),
        'getBoundingClientRect'
      )
      .mockReturnValue({ top })

  beforeEach(() => {
    sessionStorage.clear()
    profile()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('puts the contributions box back where it was after the reload', async () => {
    boxTop(140)
    document.querySelector('.ic-past-year').click()
    await vi.waitFor(() =>
      expect(sessionStorage.getItem('ic-past-year-scroll')).not.toBeNull()
    )
    // The new page opens at the top with the box further down.
    boxTop(1200)
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    expect(restorePastYearScroll(at('/someone'))).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith(0, 1060)
    // Only once: later renders on the same page keep the user's scroll.
    expect(restorePastYearScroll(at('/someone'))).toBe(false)
  })

  it('leaves modified clicks to the browser and ignores stale positions', async () => {
    const link = document.querySelector('.ic-past-year')
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true
    })
    const stop = (event) => event.preventDefault()
    document.addEventListener('click', stop)
    link.dispatchEvent(click)
    document.removeEventListener('click', stop)
    expect(fetch).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    sessionStorage.setItem(
      'ic-past-year-scroll',
      JSON.stringify({ path: '/someone', top: 10, time: Date.now() - 60_000 })
    )
    expect(restorePastYearScroll(at('/someone'))).toBe(false)
    sessionStorage.setItem(
      'ic-past-year-scroll',
      JSON.stringify({ path: '/someone-else', top: 10, time: Date.now() })
    )
    expect(restorePastYearScroll(at('/someone'))).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('works when the browser blocks site storage', () => {
    // Blocked site data makes reading sessionStorage itself throw.
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('Access is denied', 'SecurityError')
    })
    expect(restorePastYearScroll(at('/someone'))).toBe(false)
  })
})
