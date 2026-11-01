import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

// Run pnpm run build first. This uses an isolated browser and real extension storage.
const root = fileURLToPath(new URL('..', import.meta.url))
const extension = path.join(root, 'dist')
const manifest = JSON.parse(
  await readFile(path.join(extension, 'manifest.json'), 'utf8')
)
const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: true,
  args: ['--enable-unsafe-extension-debugging']
})

try {
  const id = await browser.installExtension(extension)
  const popupUrl = `chrome-extension://${id}/${manifest.action.default_popup}`
  const storagePage = await browser.newPage()
  await storagePage.goto(popupUrl)
  await storagePage.waitForFunction(
    () => !document.querySelector('fieldset').disabled
  )

  for (const reset of [false, true]) {
    await storagePage.evaluate(
      (color) => chrome.storage.local.set({ contributionColor: color }),
      reset ? '#0969da' : '#a020e0'
    )
    const popup = await browser.newPage()
    await popup.goto(popupUrl)
    await popup.waitForFunction(
      () => !document.querySelector('fieldset').disabled
    )
    await popup.evaluate(() => {
      const originalSet = chrome.storage.local.set.bind(chrome.storage.local)
      // Hold callbacks until the page closes. Storage writes still run normally.
      chrome.storage.local.set = (settings) => originalSet(settings)
    })
    const expected = reset ? '#0969da' : '#cc0000'
    await popup.evaluate((reset) => {
      const input = document.getElementById('contribution-color')
      input.value = '#aa0000'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      if (reset) {
        document.getElementById('reset-color').click()
      } else {
        input.value = '#cc0000'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, reset)
    const displayed = await popup.$eval(
      '#contribution-color',
      (input) => input.value
    )
    assert.equal(displayed, expected)
    await popup.close()
    await storagePage.waitForFunction(
      async (expected) =>
        (await chrome.storage.local.get('contributionColor'))
          .contributionColor === expected,
      { timeout: 5000 },
      expected
    )
    await storagePage.reload()
    await storagePage.waitForFunction(
      (expected) =>
        !document.querySelector('fieldset').disabled &&
        document.getElementById('contribution-color').value === expected,
      { timeout: 5000 },
      expected
    )
    console.log(
      `${reset ? 'Blue reset' : 'Final color'} persists after closing the popup before callbacks.`
    )
  }
} finally {
  await browser.close()
}
