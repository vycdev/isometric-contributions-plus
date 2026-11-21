// GitHub's year list beside the contribution graph.

const STYLE_ID = 'ic-year-list-theme'
const PAST_YEAR_CLASS = 'ic-past-year'
const LIST_SELECTOR = '.js-profile-timeline-year-list .filter-list'
const SCROLL_KEY = 'ic-past-year-scroll'
// Ignore a saved position if the page took this long to load.
const SCROLL_MAX_AGE = 30_000
const ANCHOR_SELECTOR = '.js-yearly-contributions'

const readSession = (storage, key) => {
  try {
    return JSON.parse(storage?.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

const isPlainClick = (event) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

/**
 * If Past year has to fall back to a full page load, remember where the
 * contributions box sat in the viewport so the next page can put it back.
 */
const rememberScroll = (link, doc, storage) => {
  const anchor = doc.querySelector(ANCHOR_SELECTOR)
  if (!anchor) return
  try {
    storage?.setItem(
      SCROLL_KEY,
      JSON.stringify({
        path: link.pathname,
        top: anchor.getBoundingClientRect().top,
        time: Date.now()
      })
    )
  } catch {
    // Storage can be unavailable; the page then simply opens at the top.
  }
}

const parseFragment = (doc, html) => {
  // A template keeps any scripts in the response from running.
  const template = doc.createElement('template')
  template.innerHTML = html
  return template.content
}

const withoutDateFilter = (path, origin) => {
  const url = new URL(path, origin)
  for (const key of ['from', 'to', 'org']) url.searchParams.delete(key)
  return url
}

let pastYearRequest = null

/** The page moved on (another profile, or a GitHub year switch) meanwhile. */
export const STALE = 'stale'

const snapshot = (doc, win) => {
  const box = doc.querySelector('.js-yearly-contributions')
  const href = win.location.href
  return () =>
    win.location.href !== href ||
    !box?.isConnected ||
    doc.querySelector('.js-yearly-contributions') !== box
}

/**
 * Switch to GitHub's default past-year view in place, the way GitHub's own year
 * links switch years: fetch the graph and activity without a date filter, swap
 * them in and add a history entry. Resolves to true once switched, false if
 * the page lacks what GitHub's year switching needs, or STALE if the page
 * changed while loading (the result is then discarded).
 */
export const loadPastYear = async (doc = document, win = window) => {
  const graph = doc.querySelector('.js-calendar-graph')
  const box = doc.querySelector('.js-yearly-contributions')
  if (!graph?.dataset.graphUrl || !box) return false
  const isStale = snapshot(doc, win)
  const origin = win.location.origin
  const graphUrl = withoutDateFilter(graph.dataset.graphUrl, origin)
  const pageUrl = withoutDateFilter(
    graph.dataset.url || win.location.pathname,
    origin
  )
  const activityUrl = new URL(pageUrl)
  activityUrl.searchParams.append('tab', 'overview')
  const activity = doc.getElementById('js-contribution-activity')
  // GitHub returns page fragments, rather than whole pages, for these requests.
  const fetchHtml = async (url) => {
    const response = await win.fetch(url, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin'
    })
    if (!response.ok)
      throw new Error(`GitHub responded with ${response.status}`)
    return response.text()
  }

  activity?.classList.add('loading')
  try {
    const [graphHtml, activityHtml] = await Promise.all([
      fetchHtml(graphUrl),
      activity ? fetchHtml(activityUrl) : null
    ])
    if (isStale() || (activity && !activity.isConnected)) return STALE
    const nextBox = parseFragment(doc, graphHtml)
    if (!nextBox.querySelector('.js-calendar-graph')) {
      throw new Error('Unexpected contribution graph response')
    }
    doc.querySelector('.js-yearly-contributions')?.replaceWith(nextBox)
    if (activity && activityHtml !== null) {
      activity.replaceChildren(parseFragment(doc, activityHtml))
    }
  } finally {
    activity?.classList.remove('loading')
  }

  // As on the default page, GitHub's own selection rests on the current year.
  for (const list of doc.querySelectorAll(LIST_SELECTOR)) {
    const current = list.querySelector('.js-year-link')
    const selected = list.querySelector('.js-year-link.selected')
    if (!current || current === selected) continue
    selected?.classList.remove('selected')
    selected?.removeAttribute('aria-current')
    current.classList.add('selected')
    current.setAttribute('aria-current', 'true')
  }
  // A fresh Turbo restoration id lets Back and Forward reload each view, as
  // they do after GitHub's own year switches.
  win.history.pushState(
    {
      turbo: { restorationIdentifier: win.crypto.randomUUID() },
      turboCount: 0
    },
    '',
    pageUrl.pathname + pageUrl.search
  )
  doc
    .getElementById('js-contribution-activity-description')
    ?.focus({ preventScroll: true })
  return true
}

const onPastYearClick = (event, link, doc, win) => {
  if (!isPlainClick(event)) return
  event.preventDefault()
  if (link.classList.contains('selected') || pastYearRequest) return
  const isStale = snapshot(doc, win)
  pastYearRequest = loadPastYear(doc, win)
    .catch(() => false)
    .then((result) => {
      // Fall back to a full load only if the user is still where they clicked.
      if (result === true || result === STALE || isStale()) return
      rememberScroll(link, doc, win.sessionStorage)
      win.location.assign(link.href)
    })
    .finally(() => {
      pastYearRequest = null
    })
}

// One listener per document rather than per link: Turbo restores pages from
// clones, which keep the link but drop listeners attached to it.
const listeningDocuments = new WeakSet()
const listenForPastYear = (doc) => {
  if (listeningDocuments.has(doc)) return
  listeningDocuments.add(doc)
  doc.addEventListener('click', (event) => {
    const link = event.target?.closest?.(`.${PAST_YEAR_CLASS}`)
    if (link) onPastYearClick(event, link, doc, doc.defaultView)
  })
}

/**
 * Call once the contributions box has its final height (after the charts are
 * inserted) to return it to where it was when Past year was clicked.
 */
export const restorePastYearScroll = (
  loc = window.location,
  doc = document,
  storage = globalThis.sessionStorage
) => {
  const saved = readSession(storage, SCROLL_KEY)
  if (!saved) return false
  try {
    storage.removeItem(SCROLL_KEY)
  } catch {}
  const anchor = doc.querySelector(ANCHOR_SELECTOR)
  if (
    !anchor ||
    saved.path !== loc.pathname ||
    !(Date.now() - saved.time < SCROLL_MAX_AGE) ||
    !Number.isFinite(saved.top)
  ) {
    return false
  }
  const view = doc.defaultView
  view.scrollTo(
    0,
    view.scrollY + anchor.getBoundingClientRect().top - saved.top
  )
  return true
}

/**
 * Color the selected year with the contribution palette. GitHub rewrites the
 * list's inline style while it sticks during scrolling, so the colors live in
 * a stylesheet rather than on the list itself.
 */
export const themeYearList = (palette, doc = document) => {
  let style = doc.getElementById(STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = STYLE_ID
  }
  // Re-append if a page navigation replaced the head's contents.
  if (!style.isConnected) (doc.head ?? doc.documentElement).append(style)
  const css = `
.js-profile-timeline-year-list .filter-item.selected {
  background-color: ${palette.emphasis} !important;
  color: #ffffff !important;
}
.js-profile-timeline-year-list .filter-list:has(.${PAST_YEAR_CLASS}.selected) .js-year-link.selected:not(:hover) {
  background-color: transparent !important;
  color: var(--fgColor-muted, var(--color-fg-muted, #59636e)) !important;
}
.js-profile-timeline-year-list .filter-item:focus-visible {
  outline: 2px solid ${palette.accent};
  outline-offset: 2px;
}`
  if (style.textContent !== css) style.textContent = css
}

/**
 * GitHub's default view shows the past 12 months. GitHub switches years
 * without reloading and updates the URL afterwards, so the graph heading
 * ("… contributions in the last year") is the reliable signal.
 */
export const isPastYearView = (heading, search = '') =>
  typeof heading === 'string'
    ? /\bin the last year\b/i.test(heading)
    : !new URLSearchParams(search).has('from')

/**
 * GitHub has no way back to its default past-year view once a year is chosen.
 * Add a "Past year" entry above the years that links to the unfiltered profile.
 */
export const addPastYearLinks = (loc = window.location, doc = document) => {
  listenForPastYear(doc)
  const pastYear = isPastYearView(
    doc.querySelector('.js-yearly-contributions h2')?.textContent,
    loc.search
  )
  for (const list of doc.querySelectorAll(LIST_SELECTOR)) {
    let link = list.querySelector(`.${PAST_YEAR_CLASS}`)
    if (!link) {
      const year = list.querySelector('.js-year-link')
      if (!year) continue
      link = doc.createElement('a')
      // Match the years' spacing, but not js-year-link: GitHub binds behavior
      // to that class.
      link.className = [...year.classList]
        .filter((name) => name !== 'js-year-link' && name !== 'selected')
        .concat(PAST_YEAR_CLASS)
        .join(' ')
      link.dataset.turbo = 'false'
      link.textContent = 'Past year'
      link.setAttribute(
        'aria-label',
        'Contribution activity in the past 12 months'
      )
      const item = doc.createElement('li')
      item.append(link)
      list.prepend(item)
    }
    link.href = loc.pathname
    link.classList.toggle('selected', pastYear)
    // On the default view GitHub still marks the current year as selected.
    // Keep its class: GitHub's year switching looks up `.js-year-link.selected`
    // and fails without one. The stylesheet un-highlights it instead.
    const githubSelected = list.querySelector('.js-year-link.selected')
    if (pastYear) {
      link.setAttribute('aria-current', 'true')
      githubSelected?.setAttribute('aria-current', 'false')
    } else {
      link.removeAttribute('aria-current')
      if (githubSelected?.getAttribute('aria-current') === 'false') {
        githubSelected.setAttribute('aria-current', 'true')
      }
    }
  }
}
