/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearContributionYearCache,
  fetchContributionRange,
  fetchExtendedStreakData,
  fetchFollowingStreakData
} from './history.js'
import { calculateStreaks } from './utils.js'

const day = (date, count = 1) => ({ date: new Date(date), count })
const calendar = (year, inactiveDate) => {
  const days = []
  for (
    let time = Date.UTC(year, 0, 1);
    time < Date.UTC(year + 1, 0, 1);
    time += 86400000
  ) {
    const date = new Date(time).toISOString().slice(0, 10)
    days.push(
      `<td class="ContributionCalendar-day" data-date="${date}" data-level="${date === inactiveDate ? 0 : 1}"></td>`
    )
  }
  return `<table><tbody><tr>${days.join('')}</tr></tbody></table>`
}
const response = (html) => ({ ok: true, text: async () => html })

afterEach(() => {
  vi.unstubAllGlobals()
  clearContributionYearCache()
})

describe('historical streak fetching', () => {
  it('requests separate years until the boundary streak breaks', async () => {
    const fetchMock = vi.fn(async (url) => {
      const year = Number(new URL(url).searchParams.get('from').slice(0, 4))
      return response(calendar(year, year === 2022 ? '2022-12-30' : null))
    })
    vi.stubGlobal('fetch', fetchMock)
    const current = [day('2025-01-01', 7), day('2025-01-02', 3)]
    const result = await fetchExtendedStreakData('someone', current)

    expect(fetchMock.mock.calls.map(([url]) => new URL(url).search)).toEqual([
      '?from=2024-01-01&to=2024-12-31',
      '?from=2023-01-01&to=2023-12-31',
      '?from=2022-01-01&to=2022-12-31'
    ])
    expect(calculateStreaks(result).streakCurrent).toBe(734)
    expect(result.slice(-2)).toEqual(current)
  })

  it('stops at a failed year rather than joining nonadjacent calendars', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(calendar(2024)))
      .mockResolvedValueOnce({ ok: false })
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchExtendedStreakData('someone', [day('2025-01-01')])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(calculateStreaks(result).streakCurrent).toBe(367)
  })

  it('rejects incomplete calendars that could hide a streak break', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response(
          calendar(2024).replace(
            '<td class="ContributionCalendar-day" data-date="2024-12-30" data-level="1"></td>',
            ''
          )
        )
      )
    )
    const current = [day('2025-01-01')]
    expect(await fetchExtendedStreakData('someone', current)).toEqual(current)
  })

  it('keeps DOM counts for overlapping dates and respects the request bound', async () => {
    const fetchMock = vi.fn(async () => response(calendar(2024)))
    vi.stubGlobal('fetch', fetchMock)
    const current = [day('2024-12-30', 8), day('2024-12-31', 9)]
    const result = await fetchExtendedStreakData('someone', current, 1)
    expect(result).toHaveLength(366)
    expect(result.slice(-2)).toEqual(current)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('contribution range fetching', () => {
  it('combines the years a range spans and reuses completed years', async () => {
    const fetchMock = vi.fn(async (url) => {
      const year = Number(new URL(url).searchParams.get('from').slice(0, 4))
      return response(calendar(year))
    })
    vi.stubGlobal('fetch', fetchMock)
    const start = new Date('2023-12-30')
    const end = new Date('2024-01-02')
    const result = await fetchContributionRange('Someone', start, end)
    expect(result.map((d) => d.date.toISOString().slice(0, 10))).toEqual([
      '2023-12-30',
      '2023-12-31',
      '2024-01-01',
      '2024-01-02'
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await fetchExtendedStreakData('someone', [day('2025-01-01')], 1)
    await fetchContributionRange('someone', start, end)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('resolves to null when a date is missing and rejects failed requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response(
          calendar(2024).replace(
            '<td class="ContributionCalendar-day" data-date="2024-03-01" data-level="1"></td>',
            ''
          )
        )
      )
    )
    const range = [new Date('2024-02-28'), new Date('2024-03-02')]
    expect(await fetchContributionRange('someone', ...range)).toBeNull()
    expect(await fetchContributionRange(null, ...range)).toBeNull()

    clearContributionYearCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }))
    )
    await expect(fetchContributionRange('someone', ...range)).rejects.toThrow(
      '404'
    )
  })
})

describe('historical calendar parsing', () => {
  it('reads exact counts from tooltips linked to days by their id', async () => {
    const html = `<table><tbody><tr>
      <td data-date="2024-03-04" id="contribution-day-component-1-9" data-level="4" class="ContributionCalendar-day"></td>
      <td data-date="2024-03-05" id="contribution-day-component-2-9" data-level="0" class="ContributionCalendar-day"></td>
      <td data-date="2024-03-06" id="contribution-day-component-3-9" data-level="2" class="ContributionCalendar-day"></td>
    </tr></tbody></table>
    <tool-tip id="tooltip-a" for="contribution-day-component-1-9" class="sr-only">1,204 contributions on March 4th.</tool-tip>
    <tool-tip id="tooltip-b" for="contribution-day-component-2-9" class="sr-only">No contributions on March 5th.</tool-tip>`
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(html))
    )
    const result = await fetchContributionRange(
      'someone',
      new Date('2024-03-04'),
      new Date('2024-03-06')
    )
    // The untooltipped active day still counts as activity for streaks.
    expect(result.map((d) => d.count)).toEqual([1204, 0, 1])
  })
})

describe('shared year requests', () => {
  it('shares a request in flight and survives one caller aborting', async () => {
    let finish
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(response(calendar(2024)))
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const aborted = new AbortController()
    const range = [new Date('2024-02-01'), new Date('2024-02-03')]
    const first = fetchContributionRange('someone', ...range, aborted.signal)
    const second = fetchContributionRange('someone', ...range)
    aborted.abort()
    finish()
    await expect(first).rejects.toThrow('Aborted')
    expect((await second).map((d) => d.count)).toEqual([1, 1, 1])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a response without a calendar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response('<p>Something went wrong</p>'))
      .mockResolvedValue(response(calendar(2024)))
    vi.stubGlobal('fetch', fetchMock)
    const range = [new Date('2024-02-01'), new Date('2024-02-02')]
    await expect(fetchContributionRange('someone', ...range)).rejects.toThrow(
      'No contribution calendar'
    )
    expect(await fetchContributionRange('someone', ...range)).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('following streak fetching', () => {
  it('appends later years until the streak breaks', async () => {
    const fetchMock = vi.fn(async (url) => {
      const year = Number(new URL(url).searchParams.get('from').slice(0, 4))
      return response(calendar(year, year === 2023 ? '2023-03-10' : null))
    })
    vi.stubGlobal('fetch', fetchMock)
    const current = [day('2021-12-30'), day('2021-12-31')]
    const result = await fetchFollowingStreakData('someone', current)
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).search)).toEqual([
      '?from=2022-01-01&to=2022-12-31',
      '?from=2023-01-01&to=2023-12-31'
    ])
    // Through the inactive 2023-03-10, then stops.
    expect(result.at(-1)).toEqual(day('2023-03-10', 0))
    expect(calculateStreaks(result).streakLongest).toBe(2 + 365 + 68)
  })

  it('does nothing when the period ends inactive', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const current = [day('2021-12-30'), day('2021-12-31', 0)]
    expect(await fetchFollowingStreakData('someone', current)).toEqual(current)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
