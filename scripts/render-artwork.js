#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { intensityColor } from '../src/calendar.js'
import {
  createContributionPalette,
  DEFAULT_CONTRIBUTION_COLOR
} from '../src/palette.js'
import { contributionHeight, contributionIntensity } from '../src/utils.js'
import { calendarHtml, sampleDays } from './artwork/calendar.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (file) => fs.readFile(path.join(root, file), 'utf8')
const appDir = 'safari/Isometric Contributions/Isometric Contributions'
const resourcesDir = `${appDir} Extension/Resources`
// Palette tokens are hex; computed styles report rgb().
const rgb = (hex) =>
  `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const accentFor = (color, dark) =>
  rgb(createContributionPalette(color, dark).accent)
// Custom colors showcased in the README, in display order.
const showcaseColors = [
  { name: 'green', color: '#1a7f37' },
  { name: 'purple', color: '#8250df' },
  { name: 'orange', color: '#e16f24' }
]
const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: true
})

try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const svg = await read('scripts/artwork/icon.svg')
  const iconUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const writeIcon = async (file, size, mac = false) => {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
    await page.setContent(`<style>
      body{margin:0} .mac{position:absolute;inset:10%;border-radius:24%;
      background:linear-gradient(white,#dce4ef);display:grid;place-items:center}
      img{width:100%;height:100%}.mac img{width:75%;height:75%}
      </style>${mac ? '<div class="mac">' : ''}<img src="${iconUrl}" alt="">${mac ? '</div>' : ''}`)
    await page.evaluate(() =>
      Promise.all([...document.images].map((img) => img.decode()))
    )
    await page.screenshot({ path: path.join(root, file), omitBackground: true })
  }
  for (const size of [16, 32, 48, 128]) {
    await writeIcon(`src/icon-${size}.png`, size)
    await fs.copyFile(
      path.join(root, `src/icon-${size}.png`),
      path.join(root, resourcesDir, `icon-${size}.png`)
    )
  }
  const appIcons = JSON.parse(
    await read(`${appDir}/Assets.xcassets/AppIcon.appiconset/Contents.json`)
  )
  for (const icon of appIcons.images) {
    const size =
      Number.parseInt(icon.size, 10) * Number.parseInt(icon.scale, 10)
    await writeIcon(
      `${appDir}/Assets.xcassets/AppIcon.appiconset/${icon.filename}`,
      size,
      true
    )
  }
  await fs.copyFile(
    path.join(root, 'src/icon-128.png'),
    path.join(root, appDir, 'Resources/Icon.png')
  )
  console.log('Rendered browser and Safari icons in every declared size.')
  if (!process.argv.includes('--icons-only')) {
    const extensionId = await browser.installExtension(path.join(root, 'dist'))
    const manifest = JSON.parse(await read('dist/manifest.json'))
    const script = manifest.content_scripts[0]
    const css = (
      await Promise.all(script.css.map((file) => read(`dist/${file}`)))
    ).join('\n')
    await page.setViewport({ width: 792, height: 1000, deviceScaleFactor: 2 })
    await page.setContent(calendarHtml())
    await page.addStyleTag({
      content: await read('scripts/artwork/fixture.css')
    })
    await page.addStyleTag({ content: css })
    await page.evaluate(() => {
      window.chrome = {
        storage: {
          local: {
            get: (_keys, callback) => callback({ toggleSetting: 'both' }),
            set() {}
          },
          onChanged: {
            addListener: (callback) => {
              window.changeScale = (scale) =>
                callback({ heightScale: { newValue: scale } }, 'local')
              window.changeColor = (color) =>
                callback({ contributionColor: { newValue: color } }, 'local')
            }
          }
        }
      }
    })
    for (const file of script.js)
      await page.addScriptTag({ content: await read(`dist/${file}`) })
    await page.waitForSelector('#ic-height-scale-label')
    const daySizes = await page.$$eval('td[data-date]', (nodes) =>
      nodes.map((node) => {
        const { width, height } = node.getBoundingClientRect()
        return { width, height }
      })
    )
    assert.equal(daySizes.length, sampleDays.length)
    for (const { width, height } of daySizes) {
      assert.equal(width, 10, 'Calendar days retain their 10px width')
      assert.equal(height, width, 'Calendar days are square in the artwork')
    }
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      const { data } = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height)
      let left = canvas.width
      let right = 0
      for (let i = 3; i < data.length; i += 4) {
        if (!data[i]) continue
        const x = ((i - 3) / 4) % canvas.width
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
      const days = [...document.querySelectorAll('td[data-date]')]
      const first = days[0].getBoundingClientRect()
      const last = days.at(-1).getBoundingClientRect()
      const canvasBounds = canvas.getBoundingClientRect()
      return {
        calendarWidth: last.right - first.left,
        cubesWidth: ((right - left + 1) * canvasBounds.width) / canvas.width,
        canvasWidth: canvasBounds.width,
        containerWidth: document
          .querySelector('.chart-frame')
          .getBoundingClientRect().width
      }
    })
    assert.ok(
      Math.abs(layout.cubesWidth - layout.calendarWidth) < 30,
      'The painted 3D graph and 2D day grid have comparable widths, as in the browser reference'
    )
    assert.ok(
      Math.abs(layout.canvasWidth - layout.containerWidth) <= 2,
      'The 3D canvas keeps the extension’s full-width layout'
    )
    const section = await page.$('.js-yearly-contributions')
    const statsText = () =>
      page.$$eval('.ic-accent', (nodes) =>
        nodes.map((node) => node.textContent)
      )
    const originalStats = await statsText()
    assert.equal(
      originalStats[0],
      sampleDays
        .reduce((total, day) => total + day.count, 0)
        .toLocaleString('en-US')
    )
    const originalDays = await page.$$eval('td[data-date]', (nodes) =>
      nodes.map((node) => [
        node.dataset.date,
        node.dataset.level,
        node.getAttribute('aria-labelledby')
      ])
    )
    const colors = () =>
      page.evaluate(() => {
        const dayColors = Array.from(
          { length: 5 },
          (_, i) =>
            getComputedStyle(document.querySelector(`td[data-level="${i}"]`))
              .backgroundColor
        )
        const legendColors = [
          ...document.querySelectorAll('.calendar-legend span')
        ].map((node) => getComputedStyle(node).backgroundColor)
        const cubeLegendColors = [
          ...document.querySelectorAll('.ic-contribution-legend span')
        ].map((node) => getComputedStyle(node).backgroundColor)
        const fills = Array.from(
          { length: 5 },
          (_, i) =>
            getComputedStyle(document.querySelector(`td[data-level="${i}"]`))
              .fill
        )
        return {
          dayColors,
          legendColors,
          cubeLegendColors,
          fills,
          accent: getComputedStyle(document.querySelector('.ic-accent')).color
        }
      })
    const lightColors = await colors()
    for (const os of ['light', 'dark']) {
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: os }
      ])
      for (const mode of ['light', 'dark', 'auto']) {
        await page.evaluate(
          (mode) => (document.documentElement.dataset.colorMode = mode),
          mode
        )
        // MutationObserver redraws the canvas before this frame.
        await page.evaluate(() => new Promise(requestAnimationFrame))
        const palette = await colors()
        assert.deepEqual(palette.legendColors, palette.cubeLegendColors)
        assert.deepEqual(palette.dayColors, palette.fills)
        assert.equal(new Set(palette.legendColors).size, 5)
        assert.equal(palette.dayColors[0], palette.legendColors[0])
        const isDark = mode === 'dark' || (mode === 'auto' && os === 'dark')
        assert.equal(
          palette.accent,
          accentFor(DEFAULT_CONTRIBUTION_COLOR, isDark)
        )
        if (!isDark) assert.deepEqual(palette.dayColors, lightColors.dayColors)
        const pixels = await page.$eval('canvas', (canvas) => {
          const data = canvas
            .getContext('2d')
            .getImageData(0, 0, canvas.width, canvas.height).data
          let blue = 0
          let green = 0
          for (let i = 0; i < data.length; i += 4) {
            if (!data[i + 3]) continue
            if (data[i + 2] > data[i + 1] + 15) blue++
            if (data[i + 1] > data[i + 2] + 15) green++
          }
          return { blue, green }
        })
        assert.ok(pixels.blue > 10000, `Blue cubes in ${mode}/${os}`)
        assert.equal(pixels.green, 0)
        assert.deepEqual(await statsText(), originalStats)
        console.log(
          `Verified ${mode} theme with ${os} OS: calendar, both legends, canvas and statistics.`
        )
      }
    }
    // Exercise view modes and all existing height scales without altering 2D levels.
    const maxCount = Math.max(...sampleDays.map((day) => day.count))
    for (const scale of ['linear', 'square-root', 'logarithmic']) {
      await page.evaluate((scale) => window.changeScale(scale), scale)
      const { legendColors } = await colors()
      const expectedColors = sampleDays.map(({ count }) =>
        intensityColor(
          contributionIntensity(count, maxCount, scale),
          legendColors
        )
      )
      const calendarColors = await page.evaluate((expectedColors) => {
        const probe = document.createElement('div')
        document.body.append(probe)
        const expected = expectedColors.map((color) => {
          probe.style.backgroundColor = color
          return getComputedStyle(probe).backgroundColor
        })
        probe.remove()
        const actual = [...document.querySelectorAll('td[data-date]')]
          .map((node) => ({
            date: node.dataset.date,
            color: getComputedStyle(node).backgroundColor
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(({ color }) => color)
        return { actual, expected }
      }, expectedColors)
      assert.deepEqual(
        calendarColors.actual,
        calendarColors.expected,
        `Blue 2D cells use the selected ${scale} intensity through the CSS cascade`
      )
      assert.equal(
        await page.$eval('#ic-height-scale-label', (node) => node.textContent),
        `Scale: ${{ linear: 'Linear', 'square-root': 'Square root', logarithmic: 'Logarithmic' }[scale]}`
      )
      for (const mode of ['squares', 'cubes', 'both']) {
        await page.click(`[data-ic-option="${mode}"]`)
        const visible = await page.evaluate(() => ({
          calendar:
            getComputedStyle(document.querySelector('.js-calendar-graph'))
              .display !== 'none',
          cubes:
            getComputedStyle(
              document.querySelector('.ic-contributions-wrapper')
            ).display !== 'none'
        }))
        assert.equal(visible.calendar, mode !== 'cubes')
        assert.equal(visible.cubes, mode !== 'squares')
        assert.deepEqual(await statsText(), originalStats)
      }
      assert.equal(contributionHeight(0, maxCount, scale), 3)
      assert.equal(contributionHeight(maxCount, maxCount, scale), 103)
    }
    assert.deepEqual(
      await page.$$eval('td[data-date]', (nodes) =>
        nodes.map((node) => [
          node.dataset.date,
          node.dataset.level,
          node.getAttribute('aria-labelledby')
        ])
      ),
      originalDays
    )
    await page.evaluate(() => window.changeScale('linear'))
    for (const mode of ['light', 'dark']) {
      await page.evaluate(
        (mode) => (document.documentElement.dataset.colorMode = mode),
        mode
      )
      await page.evaluate(() => new Promise(requestAnimationFrame))
      await section.screenshot({
        path: path.join(
          root,
          `img/preview${mode === 'dark' ? '-dark' : ''}.png`
        )
      })
      const popup = await browser.newPage()
      await popup.setViewport({ width: 328, height: 480, deviceScaleFactor: 2 })
      await popup.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: mode }
      ])
      await popup.goto(
        `chrome-extension://${extensionId}/${manifest.action.default_popup}`
      )
      await popup.waitForSelector('input:checked')
      assert.equal(
        await popup.$eval(
          'input:checked',
          (node) => getComputedStyle(node).accentColor
        ),
        accentFor(DEFAULT_CONTRIBUTION_COLOR, mode === 'dark')
      )
      await (await popup.$('body')).screenshot({
        path: path.join(root, `img/settings-${mode}.png`)
      })
      await popup.close()
    }
    // Custom colors: verify every recolored surface, then capture showcases.
    const hue = (hex) => {
      const [r, g, b] = [1, 3, 5].map(
        (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255
      )
      const max = Math.max(r, g, b)
      const delta = max - Math.min(r, g, b)
      if (!delta) return 0
      const h =
        max === r
          ? ((g - b) / delta) % 6
          : max === g
            ? (b - r) / delta + 2
            : (r - g) / delta + 4
      return (h * 60 + 360) % 360
    }
    const showcase = { light: [], dark: [] }
    for (const { name, color } of showcaseColors) {
      await page.evaluate((color) => window.changeColor(color), color)
      for (const mode of ['light', 'dark']) {
        const dark = mode === 'dark'
        await page.evaluate(
          (mode) => (document.documentElement.dataset.colorMode = mode),
          mode
        )
        await page.evaluate(() => new Promise(requestAnimationFrame))
        const expected = createContributionPalette(color, dark)
        const palette = await colors()
        assert.deepEqual(
          palette.legendColors,
          expected.levels.map(rgb),
          `The 2D legend uses the ${name} ${mode} palette`
        )
        assert.deepEqual(palette.cubeLegendColors, palette.legendColors)
        assert.equal(palette.accent, rgb(expected.accent))
        // Saturated cube pixels stay near the chosen hue; gray floors are skipped.
        const cubeHues = await page.$eval(
          'canvas',
          (canvas, target) => {
            const data = canvas
              .getContext('2d')
              .getImageData(0, 0, canvas.width, canvas.height).data
            let near = 0
            let far = 0
            for (let i = 0; i < data.length; i += 4) {
              if (!data[i + 3]) continue
              const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
              const max = Math.max(r, g, b)
              const delta = max - Math.min(r, g, b)
              if (delta < 40) continue
              const h =
                max === r
                  ? ((g - b) / delta) % 6
                  : max === g
                    ? (b - r) / delta + 2
                    : (r - g) / delta + 4
              const distance = Math.abs(((h * 60 + 360) % 360) - target)
              if (Math.min(distance, 360 - distance) <= 20) near++
              else far++
            }
            return { near, far }
          },
          hue(color)
        )
        assert.ok(cubeHues.near > 10000, `${name} cubes in ${mode} theme`)
        assert.ok(
          cubeHues.far < cubeHues.near / 50,
          `${name} cubes in ${mode} theme contain no other hues`
        )
        assert.deepEqual(await statsText(), originalStats)
        showcase[mode].push({
          name,
          color,
          image: await section.screenshot({ encoding: 'base64' })
        })
      }
      console.log(`Verified ${name} (${color}) in light and dark themes.`)
    }
    await page.evaluate(
      (color) => window.changeColor(color),
      DEFAULT_CONTRIBUTION_COLOR
    )
    // Compose one captioned grid per theme, half-size so the README stays short.
    const grid = await browser.newPage()
    for (const mode of ['light', 'dark']) {
      const dark = mode === 'dark'
      await grid.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 })
      await grid.setContent(`<style>
        body{margin:0;display:inline-flex;gap:32px;padding:24px 32px 32px;
          background:${dark ? '#0d1117' : '#ffffff'};color:${dark ? '#f0f6fc' : '#1f2328'};
          font:600 22px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}
        figure{margin:0} img{display:block;width:744px}
        figcaption{display:flex;align-items:center;gap:10px;margin-bottom:16px}
        figcaption i{width:22px;height:22px;border-radius:6px}
        figcaption code{font:400 20px ui-monospace,SFMono-Regular,Consolas,monospace;opacity:.75}
        </style>${showcase[mode]
          .map(
            ({ name, color, image }) =>
              `<figure><figcaption><i style="background:${color}"></i>${name[0].toUpperCase()}${name.slice(1)}<code>${color}</code></figcaption><img src="data:image/png;base64,${image}" alt=""></figure>`
          )
          .join('')}`)
      await grid.evaluate(() =>
        Promise.all([...document.images].map((img) => img.decode()))
      )
      await (await grid.$('body')).screenshot({
        path: path.join(root, `img/colors${dark ? '-dark' : ''}.png`)
      })
    }
    await grid.close()

    // The settings menu with a custom color: picker, swatches, accents.
    const featured = showcaseColors.find(({ name }) => name === 'purple')
    for (const mode of ['light', 'dark']) {
      const popup = await browser.newPage()
      await popup.setViewport({ width: 328, height: 480, deviceScaleFactor: 2 })
      await popup.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: mode }
      ])
      const popupUrl = `chrome-extension://${extensionId}/${manifest.action.default_popup}`
      await popup.goto(popupUrl)
      await popup.evaluate(
        (color) =>
          new Promise((resolve) =>
            chrome.storage.local.set({ contributionColor: color }, resolve)
          ),
        featured.color
      )
      await popup.reload()
      await popup.waitForSelector('input:checked')
      const expected = createContributionPalette(
        featured.color,
        mode === 'dark'
      )
      assert.deepEqual(
        await popup.evaluate(() => ({
          value: document.getElementById('color-value').value,
          accent: getComputedStyle(document.querySelector('input:checked'))
            .accentColor,
          swatches: [...document.querySelectorAll('#palette-preview span')].map(
            (node) => getComputedStyle(node).backgroundColor
          )
        })),
        {
          value: featured.color,
          accent: rgb(expected.accent),
          swatches: expected.levels.map(rgb)
        }
      )
      await (await popup.$('body')).screenshot({
        path: path.join(root, `img/settings-color-${mode}.png`)
      })
      await popup.evaluate(
        () =>
          new Promise((resolve) =>
            chrome.storage.local.remove('contributionColor', resolve)
          )
      )
      await popup.close()
    }

    // Store image uses the same live chart, framed with the fork's name.
    await page.click('[data-ic-option="cubes"]')
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' }
    ])
    await page.evaluate(() => {
      document.documentElement.dataset.colorMode = 'light'
      const header = document.createElement('header')
      header.innerHTML =
        '<strong>Isometric Contributions Plus</strong><span>Your activity, in a new dimension.</span>'
      document.body.prepend(header)
    })
    await page.addStyleTag({
      content:
        'body{padding:32px;background:#edf5ff}header{width:1000px;margin:0 auto 24px;display:flex;justify-content:space-between;color:#0969da;font-size:20px}main{background:white;border-radius:12px;padding:20px;width:1020px;box-shadow:0 8px 32px #0969da18}'
    })
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
    await page.screenshot({ path: path.join(root, 'img/chrome-store.png') })

    // Capture current Chrome installation instructions with the built extension.
    await page.setViewport({ width: 981, height: 600, deviceScaleFactor: 2 })
    await page.goto('chrome://extensions/')
    await page.click('pierce/#devMode')
    await page.waitForSelector('pierce/#loadUnpacked', { visible: true })
    // Chrome starts its shadow-DOM drawer/card transitions after the toggle.
    await new Promise((resolve) => setTimeout(resolve, 500))
    await page.evaluate(() =>
      Promise.all(
        document.getAnimations().map((animation) => animation.finished)
      )
    )
    for (const id of ['devMode', 'loadUnpacked', 'dev-reload-button']) {
      await page.$eval(`pierce/#${id}`, (node) => {
        node.style.outline = '2px solid #58a6ff'
        node.style.outlineOffset = '3px'
      })
    }
    await (await page.$('pierce/extensions-toolbar')).screenshot({
      path: path.join(root, 'img/dev-mode.png')
    })
    await (await page.$('pierce/extensions-item')).screenshot({
      path: path.join(root, 'img/reload-link.png')
    })
    assert.deepEqual(errors, [])
    console.log(
      'Rendered light/dark README, custom color, settings, and store artwork; all theme checks passed.'
    )
  }
} finally {
  await browser.close()
}
