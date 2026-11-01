// Deterministic sample data, not a real user's contribution history.
let seed = 73
export const sampleDays = Array.from({ length: 364 }, (_, i) => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  const activity = seed / 2 ** 32
  const count =
    i === 0 || activity < 0.23
      ? 0
      : activity > 0.98
        ? 60
        : Math.ceil((activity - 0.23) * 18)
  return {
    date: new Date(Date.UTC(2025, 10, 2 + i)).toISOString().slice(0, 10),
    count,
    level: count === 0 ? 0 : count < 4 ? 1 : count < 9 ? 2 : count < 14 ? 3 : 4
  }
})

export const calendarHtml = (days = sampleDays) => {
  const months = []
  const monthFormat = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC'
  })
  for (let i = 0; i < days.length; i += 7) {
    const label = monthFormat.format(new Date(days[i].date))
    if (months.at(-1)?.label === label) {
      months.at(-1).weeks++
    } else {
      months.push({ label, weeks: 1 })
    }
  }
  const monthHeaders = months
    .map(({ label, weeks }) => `<th colspan="${weeks}">${label}</th>`)
    .join('')
  const rows = Array.from(
    { length: 7 },
    (_, row) =>
      `<tr><th class="weekday" scope="row"><span>${{ 1: 'Mon', 3: 'Wed', 5: 'Fri' }[row] || ''}</span></th>${days
        .filter((_, i) => i % 7 === row)
        .map((day) => {
          const i = days.indexOf(day)
          return `<td class="ContributionCalendar-day" data-date="${day.date}"
          data-level="${day.level}" data-ix="${Math.floor(i / 7)}"
          aria-labelledby="day-${i}"></td>`
        })
        .join('')}</tr>`
  ).join('')
  const legend = Array.from(
    { length: 5 },
    (_, level) => `<span class="ContributionCalendar-day"
      style="background-color:var(--contribution-default-bgColor-${level})"></span>`
  ).join('')
  return `<!doctype html><html lang="en" data-color-mode="light"><head>
    <meta charset="utf-8"><title>Contribution theme fixture</title>
    </head><body><main>
    <div class="vcard-names-container"></div>
    <section class="js-yearly-contributions">
      <h2>${days.reduce((total, day) => total + day.count, 0).toLocaleString('en-US')} contributions in the last year</h2>
      <div class="chart-frame"><div class="js-calendar-graph">
        <table class="js-calendar-graph-table">
          <thead class="months"><tr><th class="weekday"></th>${monthHeaders}</tr></thead>
          <tbody>${rows}</tbody></table>
        <div class="calendar-footer"><span>Learn how we count contributions</span>
          <div class="calendar-legend">Less ${legend} More</div></div>
        ${days.map((day, i) => `<tool-tip id="day-${i}">${day.count} contributions on ${day.date}</tool-tip>`).join('')}
      </div></div>
    </section></main></body></html>`
}
