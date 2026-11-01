#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { contributionHeight } from '../src/utils.js'
import { calendarHtml, sampleDays } from './artwork/calendar.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (file) => fs.readFile(path.join(root, file), 'utf8')
const appDir = 'safari/Isometric Contributions/Isometric Contributions'
const resourcesDir = `${appDir} Extension/Resources`
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
    await page.setViewport({ width: 1048, height: 1000, deviceScaleFactor: 2 })
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
        assert.deepEqual(palette.dayColors, palette.legendColors)
        assert.deepEqual(palette.dayColors, palette.cubeLegendColors)
        assert.deepEqual(palette.dayColors, palette.fills)
        assert.equal(new Set(palette.dayColors).size, 5)
        const isDark = mode === 'dark' || (mode === 'auto' && os === 'dark')
        assert.equal(
          palette.accent,
          isDark ? 'rgb(88, 166, 255)' : 'rgb(9, 105, 218)'
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
        mode === 'dark' ? 'rgb(88, 166, 255)' : 'rgb(9, 105, 218)'
      )
      await (await popup.$('body')).screenshot({
        path: path.join(root, `img/settings-${mode}.png`)
      })
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
      'Rendered light/dark README, settings, and store artwork; all theme checks passed.'
    )
  }
} finally {
  await browser.close()
}
