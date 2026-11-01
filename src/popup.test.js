/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createContributionPalette,
  DEFAULT_CONTRIBUTION_COLOR
} from './palette.js'
import markup from './popup.html?raw'

let storedSettings
let runtime
let get
let set

beforeEach(() => {
  vi.resetModules()
  document.documentElement.innerHTML = markup
  storedSettings = { heightScale: 'square-root' }
  runtime = {}
  get = vi.fn((_keys, callback) => callback(storedSettings))
  set = vi.fn((_settings, callback) => callback())
  vi.stubGlobal('chrome', { runtime, storage: { local: { get, set } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

const selectedScale = () => document.querySelector('input:checked')?.value
const scaleFieldset = () =>
  document.getElementById('height-scales').closest('fieldset')

it('loads the saved choice and persists a selection from the menu', async () => {
  await import('./popup.js')
  expect(selectedScale()).toBe('square-root')
  expect(scaleFieldset().disabled).toBe(false)
  expect(
    document.querySelector('input[value="logarithmic"]').labels[0].textContent
  ).toContain('Logarithmic')
  const logarithmic = document.querySelector('input[value="logarithmic"]')
  logarithmic.focus()
  logarithmic.click()
  expect(set).toHaveBeenCalledWith(
    { heightScale: 'logarithmic' },
    expect.any(Function)
  )
  expect(selectedScale()).toBe('logarithmic')
  expect(document.activeElement).toBe(logarithmic)
  expect(document.querySelector('[role="status"]').textContent).toContain(
    'Saved'
  )
})

it.each([undefined, 'unknown', 'toString'])(
  'defaults to linear for a missing or invalid preference (%s)',
  async (value) => {
    storedSettings.heightScale = value
    await import('./popup.js')
    expect(selectedScale()).toBe('linear')
    expect(set).not.toHaveBeenCalled()
  }
)

it('waits for saved settings before accepting input', async () => {
  let finishLoading
  get.mockImplementation((_keys, callback) => {
    finishLoading = callback
  })
  await import('./popup.js')
  document.querySelector('input[value="linear"]').click()
  expect(set).not.toHaveBeenCalled()
  expect(scaleFieldset().disabled).toBe(true)
  finishLoading({ heightScale: 'logarithmic' })
  expect(selectedScale()).toBe('logarithmic')
  expect(scaleFieldset().disabled).toBe(false)
})

it('restores the saved choice and reports an unsuccessful save', async () => {
  await import('./popup.js')
  set.mockImplementation((_settings, callback) => {
    runtime.lastError = { message: 'Storage unavailable' }
    callback()
    delete runtime.lastError
  })
  document.querySelector('input[value="linear"]').click()
  expect(selectedScale()).toBe('square-root')
  expect(scaleFieldset().disabled).toBe(false)
  expect(document.querySelector('[role="status"]').textContent).toContain(
    'Could not save'
  )
})

it('reports a loading error without overwriting the saved preference', async () => {
  runtime.lastError = { message: 'Storage unavailable' }
  await import('./popup.js')
  expect(scaleFieldset().disabled).toBe(true)
  expect(document.querySelector('[role="status"]').textContent).toContain(
    'Could not load'
  )
  expect(set).not.toHaveBeenCalled()
})

const pickColor = (value) => {
  const input = document.getElementById('contribution-color')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

it('loads a saved color, saves a new one, and resets only the color to blue', async () => {
  storedSettings.contributionColor = '#a120d0'
  await import('./popup.js')
  const input = document.getElementById('contribution-color')
  expect(input.value).toBe('#a120d0')
  expect(document.getElementById('palette-preview').children).toHaveLength(5)
  pickColor('#d04020')
  expect(set).toHaveBeenLastCalledWith(
    { contributionColor: '#d04020' },
    expect.any(Function)
  )
  expect(document.getElementById('color-value').value).toBe('#d04020')
  expect(document.documentElement.style.getPropertyValue('--ic-accent')).toBe(
    createContributionPalette('#d04020').accent
  )
  document.getElementById('reset-color').click()
  expect(set).toHaveBeenLastCalledWith(
    { contributionColor: DEFAULT_CONTRIBUTION_COLOR },
    expect.any(Function)
  )
  expect(input.value).toBe(DEFAULT_CONTRIBUTION_COLOR)
  expect(selectedScale()).toBe('square-root')
})

it('keeps the latest picker input when changes arrive during a pending save', async () => {
  await import('./popup.js')
  const callbacks = []
  set.mockImplementation((_settings, callback) => callbacks.push(callback))
  pickColor('#aa0000')
  pickColor('#bb0000')
  pickColor('#cc0000')
  expect(set).toHaveBeenCalledTimes(1)
  callbacks.shift()()
  expect(set).toHaveBeenLastCalledWith(
    { contributionColor: '#cc0000' },
    expect.any(Function)
  )
  callbacks.shift()()
  expect(document.getElementById('contribution-color').value).toBe('#cc0000')
  expect(set).toHaveBeenCalledTimes(2)
})

it('restores the saved color and preview after a storage error', async () => {
  storedSettings.contributionColor = '#a120d0'
  await import('./popup.js')
  set.mockImplementation((_settings, callback) => {
    runtime.lastError = { message: 'Storage unavailable' }
    callback()
    delete runtime.lastError
  })
  pickColor('#ff0000')
  expect(document.getElementById('contribution-color').value).toBe('#a120d0')
  expect(document.documentElement.style.getPropertyValue('--ic-accent')).toBe(
    createContributionPalette('#a120d0').accent
  )
  expect(document.querySelector('[role="status"]').textContent).toContain(
    'Could not save this color'
  )
})

it('refreshes the palette preview and control accents when the system theme changes', async () => {
  let onThemeChange
  const media = {
    matches: false,
    addEventListener: (_event, listener) => {
      onThemeChange = listener
    }
  }
  vi.stubGlobal('matchMedia', () => media)
  storedSettings.contributionColor = '#ffff00'
  await import('./popup.js')
  const lightPreview = document.getElementById('palette-preview').innerHTML
  media.matches = true
  onThemeChange()
  expect(document.getElementById('palette-preview').innerHTML).not.toBe(
    lightPreview
  )
  expect(document.documentElement.style.getPropertyValue('--ic-accent')).toBe(
    createContributionPalette('#ffff00', true).accent
  )
  expect(document.getElementById('contribution-color').value).toBe('#ffff00')
  expect(set).not.toHaveBeenCalled()
})
