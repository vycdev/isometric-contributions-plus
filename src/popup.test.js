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

const selectedScale = () =>
  document.querySelector('#height-scales input:checked')?.value
const scaleFieldset = () =>
  document.getElementById('height-scales').closest('fieldset')

it('loads the saved choice and persists a selection from the menu', async () => {
  await import('./popup.js')
  expect(selectedScale()).toBe('square-root')
  expect(scaleFieldset().disabled).toBe(false)
  expect(scaleFieldset().querySelector('legend').textContent).toBe(
    'Contribution scale'
  )
  expect(document.getElementById('scale-description').textContent).toContain(
    '2D color intensity'
  )
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

// A discrete pick: the browser fires input, then change when it commits.
const pickColor = (value) => {
  const input = document.getElementById('contribution-color')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
const dragColor = (value) => {
  const input = document.getElementById('contribution-color')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const savedColors = () =>
  set.mock.calls.map(([settings]) => settings.contributionColor).filter(Boolean)

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

const viewInputs = () => [...document.querySelectorAll('#views input')]
const checkedViews = () =>
  viewInputs()
    .filter((input) => input.checked)
    .map((input) => input.value)

it.each([
  [undefined, undefined, ['cubes']],
  [undefined, 'squares', ['squares']],
  [undefined, 'both', ['cubes', 'squares']],
  [['line', 'squares'], 'both', ['line', 'squares']],
  [['unknown'], 'cubes', ['cubes']]
])(
  'loads views %j with the retired toggle %s as %j',
  async (views, toggleSetting, expected) => {
    Object.assign(storedSettings, { views, toggleSetting })
    await import('./popup.js')
    expect(get.mock.calls[0][0]).toEqual(
      expect.arrayContaining(['views', 'toggleSetting'])
    )
    expect(viewInputs().map((input) => input.value)).toEqual([
      'cubes',
      'line',
      'squares'
    ])
    expect(checkedViews()).toEqual(expected)
    expect(set).not.toHaveBeenCalled()
  }
)

it('saves any combination of views and keeps the last one enabled', async () => {
  await import('./popup.js')
  const [cubes, line, squares] = viewInputs()
  cubes.click()
  expect(cubes.checked).toBe(true)
  expect(set).not.toHaveBeenCalled()
  expect(document.querySelector('[role="status"]').textContent).toBe(
    'At least one view stays on.'
  )
  line.click()
  expect(set).toHaveBeenLastCalledWith(
    { views: ['cubes', 'line'] },
    expect.any(Function)
  )
  squares.click()
  expect(set).toHaveBeenLastCalledWith(
    { views: ['cubes', 'line', 'squares'] },
    expect.any(Function)
  )
  cubes.click()
  line.click()
  expect(set).toHaveBeenLastCalledWith(
    { views: ['squares'] },
    expect.any(Function)
  )
  expect(document.querySelector('[role="status"]').textContent).toContain(
    'Saved'
  )
  squares.click()
  expect(squares.checked).toBe(true)
  expect(set).toHaveBeenCalledTimes(4)
})

it('restores the saved views after an unsuccessful save', async () => {
  storedSettings.views = ['cubes', 'squares']
  await import('./popup.js')
  set.mockImplementation((_settings, callback) => {
    runtime.lastError = { message: 'Storage unavailable' }
    callback()
    delete runtime.lastError
  })
  viewInputs()[1].click()
  expect(checkedViews()).toEqual(['cubes', 'squares'])
  expect(document.querySelector('[role="status"]').textContent).toContain(
    'Could not save your views'
  )
})

it('previews every color while dragging but saves at most once per interval', async () => {
  vi.useFakeTimers()
  try {
    await import('./popup.js')
    const shades = Array.from(
      { length: 10 },
      (_, i) => `#${(0xa00000 + i * 0x10).toString(16)}`
    )
    for (const shade of shades) dragColor(shade)
    expect(savedColors()).toEqual([shades[0]])
    expect(document.getElementById('color-value').value).toBe(shades[9])
    expect(document.documentElement.style.getPropertyValue('--ic-accent')).toBe(
      createContributionPalette(shades[9]).accent
    )

    vi.advanceTimersByTime(150)
    expect(savedColors()).toEqual([shades[0], shades[9]])
    vi.advanceTimersByTime(1000)
    expect(savedColors()).toHaveLength(2)

    // Releasing the picker saves the final color without waiting.
    dragColor('#00aa00')
    expect(savedColors()).toHaveLength(3)
    dragColor('#00bb00')
    document
      .getElementById('contribution-color')
      .dispatchEvent(new Event('change', { bubbles: true }))
    expect(savedColors().at(-1)).toBe('#00bb00')
    vi.advanceTimersByTime(1000)
    expect(savedColors()).toHaveLength(4)
  } finally {
    vi.useRealTimers()
  }
})

it('drops a pending drag color when resetting to blue', async () => {
  vi.useFakeTimers()
  try {
    await import('./popup.js')
    dragColor('#aa0000')
    dragColor('#bb0000')
    document.getElementById('reset-color').click()
    vi.advanceTimersByTime(1000)
    expect(savedColors()).toEqual(['#aa0000', DEFAULT_CONTRIBUTION_COLOR])
    expect(document.getElementById('contribution-color').value).toBe(
      DEFAULT_CONTRIBUTION_COLOR
    )
  } finally {
    vi.useRealTimers()
  }
})

it('saves a pending drag color when the menu closes', async () => {
  vi.useFakeTimers()
  try {
    await import('./popup.js')
    dragColor('#aa0000')
    dragColor('#bb0000')
    window.dispatchEvent(new Event('pagehide'))
    expect(savedColors()).toEqual(['#aa0000', '#bb0000'])
  } finally {
    vi.useRealTimers()
  }
})

it('links to the project repository in a new tab', async () => {
  await import('./popup.js')
  const link = document.querySelector('header .repo-link')
  expect(link.href).toBe(
    'https://github.com/vycdev/isometric-contributions-plus'
  )
  expect(link.target).toBe('_blank')
  expect(link.rel).toBe('noopener noreferrer')
  expect(link.textContent.trim()).toBe('GitHub repository')
})
