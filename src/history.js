import { localDateKey, parseContributionsHtml } from './utils.js'

const dateKey = (date) => date.toISOString().slice(0, 10)
const DAY_MS = 24 * 60 * 60 * 1000

// Completed years cannot change, so streaks and the line chart share one
// request per profile and year for the lifetime of the page. Requests in
// flight are shared too: both features ask for the same year at once.
const yearCache = new Map()
const pendingYears = new Map()

export const clearContributionYearCache = () => {
  yearCache.clear()
  pendingYears.clear()
}

const requestYear = async (username, year) => {
  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions?from=${year}-01-01&to=${year}-12-31`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GitHub responded with ${response.status}`)
  const days = parseContributionsHtml(await response.text())
  // A page without a calendar (an interstitial or changed markup) is a
  // failure, not an empty year, and must not be cached.
  if (!days.length) throw new Error(`No contribution calendar for ${year}`)
  return days
}

const abortError = () => new DOMException('Aborted', 'AbortError')

/**
 * Fetch one calendar year of a profile's daily counts.
 * @throws when the request fails, GitHub responds with an error or no
 *   calendar, or `signal` aborts
 */
export const fetchContributionYear = async (username, year, signal) => {
  if (signal?.aborted) throw abortError()
  const key = `${username.toLowerCase()}:${year}`
  if (yearCache.has(key)) return yearCache.get(key)
  let pending = pendingYears.get(key)
  if (!pending) {
    // Not tied to one caller's signal, so aborting one caller cannot fail
    // another that shares the request.
    pending = requestYear(username, year)
      .then((days) => {
        if (year < new Date().getUTCFullYear()) yearCache.set(key, days)
        return days
      })
      .finally(() => pendingYears.delete(key))
    pendingYears.set(key, pending)
  }
  const days = await pending
  if (signal?.aborted) throw abortError()
  return days
}

/**
 * Fetch daily counts covering [start, end] (UTC dates, inclusive).
 * Resolves to null unless every date in the range is available.
 */
export const fetchContributionRange = async (username, start, end, signal) => {
  if (!username) return null
  const years = []
  for (
    let year = start.getUTCFullYear();
    year <= end.getUTCFullYear();
    year++
  ) {
    years.push(year)
  }
  const fetched = await Promise.all(
    years.map((year) => fetchContributionYear(username, year, signal))
  )
  const dates = new Map(fetched.flat().map((day) => [dateKey(day.date), day]))
  const days = []
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    const day = dates.get(dateKey(new Date(time)))
    if (!day) return null
    days.push(day)
  }
  return days
}

export const fetchExtendedStreakData = async (
  username,
  currentDays,
  maxYearsBack = 10,
  signal
) => {
  if (!username || !currentDays.length) return currentDays

  let combined = currentDays
  const earliestYear = currentDays[0].date.getUTCFullYear()

  for (let offset = 0; offset < maxYearsBack; offset++) {
    if (signal?.aborted) break
    const year = earliestYear - offset
    // Skip dates already present in the visible calendar.
    if (combined[0].date.getTime() === Date.UTC(year, 0, 1)) continue

    let historicalDays
    try {
      historicalDays = await fetchContributionYear(username, year, signal)
    } catch {
      break
    }

    const boundary = combined[0].date.getTime()
    const dates = new Map(historicalDays.map((day) => [dateKey(day.date), day]))
    const earlierDays = []
    // Missing dates must not bridge a streak gap.
    for (let time = Date.UTC(year, 0, 1); time < boundary; time += DAY_MS) {
      const day = dates.get(dateKey(new Date(time)))
      if (!day) return combined
      earlierDays.push(day)
    }

    combined = [...earlierDays, ...combined]
    // Older years cannot extend a broken streak.
    if (earlierDays.some((day) => day.count === 0)) break
  }

  return combined
}

/**
 * The forward counterpart of fetchExtendedStreakData, for a past period whose
 * last day had activity: append the following days, year by year, until the
 * streak breaks or today is reached, so a streak running past the end of the
 * period is not cut off.
 */
export const fetchFollowingStreakData = async (
  username,
  currentDays,
  maxYearsForward = 10,
  signal
) => {
  if (!username || !currentDays.length) return currentDays

  let combined = currentDays
  const today = localDateKey()
  for (let step = 0; step < maxYearsForward; step++) {
    if (signal?.aborted || combined.at(-1).count === 0) break
    const start = combined.at(-1).date.getTime() + DAY_MS
    if (dateKey(new Date(start)) > today) break
    const year = new Date(start).getUTCFullYear()

    let followingDays
    try {
      followingDays = await fetchContributionYear(username, year, signal)
    } catch {
      break
    }

    const dates = new Map(followingDays.map((day) => [dateKey(day.date), day]))
    const laterDays = []
    for (
      let time = start;
      time < Date.UTC(year + 1, 0, 1) && dateKey(new Date(time)) <= today;
      time += DAY_MS
    ) {
      const day = dates.get(dateKey(new Date(time)))
      // Missing dates must not bridge a streak gap.
      if (!day) return [...combined, ...laterDays]
      laterDays.push(day)
      if (day.count === 0) break
    }
    combined = [...combined, ...laterDays]
  }

  return combined
}
