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

it('submits every changed color before any save callbacks run', async () => {
  await import('./popup.js')
  const callbacks = []
  set.mockImplementation((_settings, callback) => callbacks.push(callback))
  pickColor('#aa0000')
  pickColor('#bb0000')
  pickColor('#cc0000')
  expect(
    set.mock.calls.map(([settings]) => settings.contributionColor)
  ).toEqual(['#aa0000', '#bb0000', '#cc0000'])
  expect(set).toHaveBeenLastCalledWith(
    { contributionColor: '#cc0000' },
    expect.any(Function)
  )
  callbacks[2]()
  callbacks[0]()
  callbacks[1]()
  expect(document.getElementById('contribution-color').value).toBe('#cc0000')
  expect(set).toHaveBeenCalledTimes(3)
})

it('submits a blue reset while an earlier color save is still pending', async () => {
  storedSettings.contributionColor = DEFAULT_CONTRIBUTION_COLOR
  await import('./popup.js')
  set.mockImplementation(() => {})
  pickColor('#aa0000')
  document.getElementById('reset-color').click()
  expect(
    set.mock.calls.map(([settings]) => settings.contributionColor)
  ).toEqual(['#aa0000', DEFAULT_CONTRIBUTION_COLOR])
  expect(document.getElementById('contribution-color').value).toBe(
    DEFAULT_CONTRIBUTION_COLOR
  )
})

it.each([false, true])(
  'ignores a stale callback after the newest save succeeds (error: %s)',
  async (failed) => {
    await import('./popup.js')
    const callbacks = []
    set.mockImplementation((_settings, callback) => callbacks.push(callback))
    pickColor('#aa0000')
    pickColor('#bb0000')
    callbacks[1]()
    if (failed) runtime.lastError = { message: 'Earlier save failed' }
    callbacks[0]()
    delete runtime.lastError
    expect(document.getElementById('contribution-color').value).toBe('#bb0000')
    expect(document.querySelector('[role="status"]').textContent).toContain(
      'Saved'
    )
  }
)

it.each([false, true])(
  'restores the last successful color when the newest save fails (failure arrives first: %s)',
  async (failureFirst) => {
    storedSettings.contributionColor = '#a020e0'
    await import('./popup.js')
    const callbacks = []
    set.mockImplementation((_settings, callback) => callbacks.push(callback))
    pickColor('#aa0000')
    pickColor('#bb0000')
    if (!failureFirst) callbacks[0]()
    runtime.lastError = { message: 'Latest save failed' }
    callbacks[1]()
    delete runtime.lastError
    if (failureFirst) callbacks[0]()
    expect(document.getElementById('contribution-color').value).toBe('#aa0000')
    expect(document.documentElement.style.getPropertyValue('--ic-accent')).toBe(
      createContributionPalette('#aa0000').accent
    )
    expect(document.querySelector('[role="status"]').textContent).toContain(
      'Could not save this color'
    )
  }
)

it('keeps a new selection after an error when an older success arrives later', async () => {
  await import('./popup.js')
  const callbacks = []
  set.mockImplementation((_settings, callback) => callbacks.push(callback))
  pickColor('#aa0000')
  pickColor('#bb0000')
  runtime.lastError = { message: 'Save failed' }
  callbacks[1]()
  delete runtime.lastError
  pickColor('#cc0000')
  callbacks[0]()
  expect(document.getElementById('contribution-color').value).toBe('#cc0000')
  callbacks[2]()
  expect(document.querySelector('[role="status"]').textContent).toContain(
    'Saved'
  )
})

it('retries a failed reset even when blue is already shown as the fallback', async () => {
  storedSettings.contributionColor = DEFAULT_CONTRIBUTION_COLOR
  await import('./popup.js')
  const callbacks = []
  set.mockImplementation((_settings, callback) => callbacks.push(callback))
  pickColor('#aa0000')
  document.getElementById('reset-color').click()
  runtime.lastError = { message: 'Reset failed' }
  callbacks[1]()
  delete runtime.lastError
  document.getElementById('reset-color').click()
  expect(set).toHaveBeenCalledTimes(3)
  expect(set).toHaveBeenLastCalledWith(
    { contributionColor: DEFAULT_CONTRIBUTION_COLOR },
    expect.any(Function)
  )
  callbacks[2]()
  callbacks[0]()
  expect(document.getElementById('contribution-color').value).toBe(
    DEFAULT_CONTRIBUTION_COLOR
  )
  expect(document.querySelector('[role="status"]').textContent).toContain(
    'Saved'
  )
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
