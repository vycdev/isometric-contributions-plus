import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer'
import { createContributionPalette } from './src/palette.js'

const filterTtyWarning = (stream) => {
  const originalWrite = stream.write.bind(stream)
  stream.write = (chunk, encoding, callback) => {
    const message = typeof chunk === 'string' ? chunk : chunk?.toString?.()
    if (message?.includes('Opening `/dev/tty` failed')) {
      return true
    }

    return originalWrite(chunk, encoding, callback)
  }
}

filterTtyWarning(process.stderr)
filterTtyWarning(process.stdout)

const validateNumberIsNonNegative = (number) => {
  const value = Number.parseInt(number.replaceAll(',', ''), 10)
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`Invalid contribution total: ${number}`)
  }

  return value
}

const validateContributionTotal = (total, { min = 0, max = Infinity } = {}) => {
  if (total < min || total > max) {
    throw new Error(`Contribution total out of range: ${total}`)
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const headingText = (page) =>
  page.evaluate(
    () =>
      document
        .querySelector('.js-yearly-contributions h2')
        ?.textContent.replace(/\s+/g, ' ')
        .trim() ?? ''
  )
const waitForHeading = (page, pattern) =>
  page.waitForFunction(
    (source) =>
      new RegExp(source).test(
        document.querySelector('.js-yearly-contributions h2')?.textContent ?? ''
      ),
    { timeout: 20_000 },
    pattern
  )

const checkLineInteractions = async (page, setViews) => {
  console.log('Checking line view interactions...')
  await setViews(['line'])
  await page.goto('https://github.com/jasonlong', {
    waitUntil: 'networkidle2',
    timeout: 30_000
  })
  await page.waitForSelector('.ic-line-previous', { timeout: 20_000 })

  // page.focus only accepts HTML elements; the chart is a focusable SVG.
  await page.$eval('.ic-line-view svg', (chart) => chart.focus())
  await page.keyboard.press('End')
  const tooltip = await page.$eval('.ic-line-tip', (element) => ({
    visible: element.classList.contains('ic-line-tip-visible'),
    text: element.textContent
  }))
  if (!tooltip.visible || !/\d{4}/.test(tooltip.text)) {
    throw new Error(`Line keyboard tooltip missing: "${tooltip.text}"`)
  }
  if (!tooltip.text.includes('Year before')) {
    throw new Error('Line tooltip lacks the year-before value')
  }

  await page.click('[data-ic-line-mode="cumulative"]')
  await page.waitForSelector('.ic-line-area')
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForSelector('.ic-line-view svg', { timeout: 20_000 })
  if (!(await page.$('.ic-line-area'))) {
    throw new Error('Cumulative line mode was not remembered after reload')
  }
  await page.click('[data-ic-line-mode="activity"]')
  await page.waitForSelector('.ic-line-bar')
  console.log('Line keyboard tooltip and mode persistence working correctly')
}

const checkColorChange = async (page, browser, popupUrl) => {
  console.log('Checking color changes...')
  const popup = await browser.newPage()
  await popup.goto(popupUrl)
  await popup.waitForFunction(
    () => !document.querySelector('fieldset').disabled
  )
  const repoLink = await popup.$eval('.repo-link', (link) => link.href)
  if (repoLink !== 'https://github.com/vycdev/isometric-contributions-plus') {
    throw new Error(`Unexpected repository link: ${repoLink}`)
  }
  const dark = await page.evaluate(
    () =>
      document.documentElement.dataset.colorMode === 'dark' ||
      (document.documentElement.dataset.colorMode !== 'light' &&
        matchMedia('(prefers-color-scheme: dark)').matches)
  )
  const waitForAccent = (color) =>
    page.waitForFunction(
      (expected) =>
        document
          .querySelector('.js-yearly-contributions')
          .style.getPropertyValue('--ic-accent') === expected,
      { timeout: 5000 },
      createContributionPalette(color, dark).accent
    )
  await popup.evaluate(() => {
    const input = document.getElementById('contribution-color')
    input.value = '#d040a0'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await waitForAccent('#d040a0')
  await popup.click('#reset-color')
  await waitForAccent('#0969da')
  await popup.close()
  console.log('Popup link and live color changes working correctly')
}

const checkYearList = async (page, setViews, pageErrors) => {
  console.log('Checking year list and Past year...')
  await setViews(['cubes', 'line', 'squares'])
  // GitHub only shows the year list on wide windows.
  await page.setViewport({ width: 2000, height: 1000 })
  await page.goto('https://github.com/jasonlong', {
    waitUntil: 'networkidle2',
    timeout: 30_000
  })
  await page.waitForSelector('.ic-past-year')
  const errorsBefore = pageErrors.length
  const highlighted = () =>
    page.evaluate(() =>
      [
        ...[...document.querySelectorAll('.js-profile-timeline-year-list')]
          .find((element) => element.getBoundingClientRect().width)
          .querySelectorAll('.filter-item')
      ]
        .filter(
          (item) =>
            getComputedStyle(item).backgroundColor !== 'rgba(0, 0, 0, 0)'
        )
        .map((item) => item.textContent.trim())
    )
  const clickItem = (selector) =>
    page.evaluate(
      (target) =>
        [...document.querySelectorAll('.js-profile-timeline-year-list')]
          .find((element) => element.getBoundingClientRect().width)
          .querySelector(target)
          .click(),
      selector
    )

  let shown = await highlighted()
  if (shown.join() !== 'Past year') {
    throw new Error(`Default view should highlight only Past year: ${shown}`)
  }

  // GitHub's own year switching must keep working beside Past year.
  await clickItem('.js-year-link:not(.selected)')
  await waitForHeading(page, 'in \\d{4}')
  await pause(1500)
  shown = await highlighted()
  if (shown.length !== 1 || shown[0] === 'Past year') {
    throw new Error(`A chosen year should be highlighted alone: ${shown}`)
  }
  if (!(await page.$('#isometric-contributions'))) {
    throw new Error('Charts were not rebuilt after switching years')
  }

  await page.evaluate(() => window.scrollTo(0, 900))
  await pause(300)
  const scrollBefore = await page.evaluate(() => window.scrollY)
  let loads = 0
  const countLoad = () => loads++
  page.on('load', countLoad)
  await clickItem('.ic-past-year')
  await waitForHeading(page, 'in the last year')
  await page.waitForSelector('.ic-line-view svg', { timeout: 20_000 })
  await pause(1000)
  page.off('load', countLoad)
  const after = await page.evaluate(() => ({
    path: location.pathname + location.search,
    scroll: window.scrollY
  }))
  if (loads !== 0) throw new Error('Past year reloaded the page')
  if (after.path !== '/jasonlong') {
    throw new Error(`Past year should restore the plain URL: ${after.path}`)
  }
  if (Math.abs(after.scroll - scrollBefore) > 2) {
    throw new Error(
      `Past year moved the page from ${scrollBefore} to ${after.scroll}`
    )
  }
  shown = await highlighted()
  if (shown.join() !== 'Past year') {
    throw new Error(`Past year should be highlighted after switching: ${shown}`)
  }
  console.log(`Heading after Past year: ${await headingText(page)}`)

  const newErrors = pageErrors.slice(errorsBefore)
  if (newErrors.length) {
    throw new Error(
      `Page errors during year switching: ${newErrors.join('; ')}`
    )
  }
  await page.setViewport({ width: 1280, height: 1024 })
  console.log('Year list, Past year and year switching working correctly')
}

const run = async () => {
  console.log('Starting extension health check...')

  const pathToExtension = path.join(process.cwd(), 'dist')
  console.log('Extension path:', pathToExtension)

  const manifest = JSON.parse(
    await readFile(path.join(pathToExtension, 'manifest.json'), 'utf8')
  )
  const browser = await puppeteer.launch({
    headless: 'new',
    pipe: true,
    enableExtensions: true,
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-logging',
      '--log-level=3',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  })

  // The profile page, so a failure screenshot shows what went wrong.
  let profilePage = null
  try {
    const extensionId = await browser.installExtension(pathToExtension)
    const popupUrl = `chrome-extension://${extensionId}/${manifest.action.default_popup}`

    // Views are chosen in the toolbar menu, so drive the real popup.
    const setViews = async (views) => {
      const popup = await browser.newPage()
      await popup.goto(popupUrl)
      await popup.waitForFunction(
        () => !document.getElementById('views').closest('fieldset').disabled
      )
      await popup.evaluate(async (wanted) => {
        const inputs = [...document.querySelectorAll('#views input')]
        const toggle = (shouldCheck) => {
          for (const input of inputs) {
            if (
              wanted.includes(input.value) === shouldCheck &&
              input.checked !== shouldCheck
            ) {
              input.click()
              changed = true
            }
          }
        }
        let changed = false
        // Turn views on first so the last enabled view is never unchecked.
        toggle(true)
        toggle(false)
        if (!changed) return
        const saved = await new Promise((resolve) =>
          chrome.storage.local.get('views', resolve)
        )
        if (JSON.stringify(saved.views) !== JSON.stringify(wanted)) {
          throw new Error(`Saved views ${JSON.stringify(saved.views)}`)
        }
      }, views)
      await popup.close()
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const visibility = () =>
      page.evaluate(() => {
        const shown = (selector) => {
          const element = document.querySelector(selector)
          return Boolean(element) && element.getClientRects().length > 0
        }
        return {
          cubes: shown('#isometric-contributions'),
          line: shown('.ic-line-view svg'),
          squares: shown('.js-calendar-graph')
        }
      })

    const expectViews = async (views, label) => {
      const shown = await visibility()
      for (const view of ['cubes', 'line', 'squares']) {
        if (shown[view] !== views.includes(view)) {
          throw new Error(
            `${label}: expected ${view} to be ${views.includes(view) ? 'visible' : 'hidden'}`
          )
        }
      }
      console.log(`${label} working correctly`)
    }

    const page = await browser.newPage()
    profilePage = page

    page.on('console', (message) => console.log('PAGE LOG:', message.text()))
    const pageErrors = []
    page.on('pageerror', (error) => {
      console.log('PAGE ERROR:', error.message)
      pageErrors.push(error.message)
    })

    await page.setViewport({ width: 1280, height: 1024 })

    const profiles = [
      {
        url: 'https://github.com/dork',
        expectedBestDay: 'No activity found',
        totalRange: { min: 0, max: 0 }
      },
      {
        url: 'https://github.com/jasonlong',
        expectedBestDay: 'has-activity',
        totalRange: { min: 1 }
      }
    ]

    for (const profile of profiles) {
      console.log(`Navigating to GitHub profile: ${profile.url}`)
      await page.goto(profile.url, {
        waitUntil: 'networkidle2',
        timeout: 30_000
      })

      console.log('Waiting for extension to inject UI...')
      await setViews(['cubes'])
      await page.waitForSelector('#isometric-contributions', {
        visible: true,
        timeout: 10_000
      })

      // Give the 3D render a moment to complete
      await new Promise((resolve) => {
        setTimeout(resolve, 2000)
      })

      console.log('Checking canvas is rendered...')
      const canvasDrawn = await page.evaluate(() => {
        const canvas = document.querySelector('#isometric-contributions')
        if (!canvas) return { exists: false }
        const ctx = canvas.getContext('2d')
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        let nonTransparentPixels = 0
        for (let i = 3; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 0) nonTransparentPixels++
        }

        return {
          exists: true,
          width: canvas.width,
          height: canvas.height,
          nonTransparentPixels
        }
      })

      if (!canvasDrawn.exists) {
        throw new Error('Canvas element #isometric-contributions not found')
      }

      if (canvasDrawn.nonTransparentPixels === 0) {
        throw new Error('Canvas exists but nothing was drawn on it')
      }

      console.log(
        `Canvas rendered: ${canvasDrawn.width}x${canvasDrawn.height} with ${canvasDrawn.nonTransparentPixels.toLocaleString()} drawn pixels`
      )
      await expectViews(['cubes'], '3D only')

      await setViews(['squares'])
      await expectViews(['squares'], '2D only')

      await setViews(['cubes', 'squares'])
      await expectViews(['cubes', 'squares'], '3D and 2D')

      await setViews(['line'])
      await page.waitForFunction(
        () =>
          !document
            .querySelector('.ic-line-stats')
            ?.textContent.includes('Loading the year before'),
        { timeout: 15_000 }
      )
      await expectViews(['line'], 'Line only')
      const line = await page.evaluate(() => ({
        path: document.querySelector('.ic-line-primary')?.getAttribute('d'),
        comparison: Boolean(document.querySelector('.ic-line-previous')),
        stats: document.querySelector('.ic-line-stats').textContent
      }))
      if (!line.path?.startsWith('M')) {
        throw new Error('Line view did not draw a trend line')
      }
      if (!line.comparison) {
        throw new Error(
          `Line view did not load the year before: ${line.stats.trim()}`
        )
      }

      await setViews(['cubes', 'line', 'squares'])
      await expectViews(['cubes', 'line', 'squares'], 'All views')

      // Switch back to 3D for contribution data check
      await setViews(['cubes'])

      console.log('Checking contribution data...')
      const contribTotal = await page.$eval(
        '.ic-contributions-wrapper ::-p-text(Contributions) + div ::-p-text(Total)',
        (element) => element.previousElementSibling.textContent
      )

      const validatedTotal = validateNumberIsNonNegative(
        contribTotal.toString()
      )
      validateContributionTotal(validatedTotal, profile.totalRange)

      const bestDayText = await page.$eval(
        '.ic-contributions-wrapper ::-p-text(Best day) + span',
        (element) => element.textContent
      )
      if (
        profile.expectedBestDay !== 'has-activity' &&
        bestDayText !== profile.expectedBestDay
      ) {
        throw new Error(
          `Expected "${profile.expectedBestDay}", got "${bestDayText}"`
        )
      }
      if (
        profile.expectedBestDay === 'has-activity' &&
        bestDayText === 'No activity found'
      ) {
        throw new Error('Expected an activity date for Best day')
      }

      console.log('Extension working correctly!')
      console.log('Contribution total:', validatedTotal.toLocaleString())
    }

    await checkLineInteractions(page, setViews)
    await checkColorChange(page, browser, popupUrl)
    await checkYearList(page, setViews, pageErrors)

    await browser.close()
  } catch (error) {
    console.error('Extension check failed:', error.message)

    try {
      const page = profilePage ?? (await browser.pages()).at(-1)
      await page.screenshot({ path: 'error-screenshot.png', fullPage: true })
      console.log('Error screenshot saved to error-screenshot.png')
    } catch {
      console.log('Could not capture screenshot')
    }

    await browser.close()
    throw error
  }
}

run()
