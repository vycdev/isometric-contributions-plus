import {
  applyContributionPalette,
  createContributionPalette,
  DEFAULT_CONTRIBUTION_COLOR,
  normalizeContributionColor
} from './palette.js'
import {
  DEFAULT_VIEWS,
  HEIGHT_SCALES,
  normalizeHeightScale,
  normalizeViews,
  VIEWS
} from './settings.js'

const options = document.getElementById('height-scales')
const viewOptions = document.getElementById('views')
const fieldset = options.closest('fieldset')
const colorInput = document.getElementById('contribution-color')
const colorValue = document.getElementById('color-value')
const preview = document.getElementById('palette-preview')
const status = document.getElementById('save-status')
const theme = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
let savedScale = 'linear'
let savedColor = DEFAULT_CONTRIBUTION_COLOR
let currentColor = savedColor
let colorRequest = 0
let savedColorRequest = 0
let latestColorFailed = false
let savedViews = [...DEFAULT_VIEWS]
let viewRequest = 0
let savedViewRequest = 0

const showColor = (value) => {
  colorInput.value = value
  colorValue.value = value
  const palette = createContributionPalette(value, theme?.matches)
  applyContributionPalette(document.documentElement, palette)
  preview.replaceChildren(
    ...palette.levels.map((color) => {
      const swatch = document.createElement('span')
      swatch.style.backgroundColor = color
      return swatch
    })
  )
}

const chooseColor = (selection) => {
  const value = normalizeContributionColor(selection)
  if (value === currentColor && !latestColorFailed) return
  currentColor = value
  const request = ++colorRequest
  latestColorFailed = false
  showColor(value)
  status.textContent = 'Saving…'
  // Submit each choice now: a popup can close before an earlier callback runs.
  chrome.storage.local.set({ contributionColor: value }, () => {
    const failed = Boolean(chrome.runtime.lastError)
    if (!failed && request > savedColorRequest) {
      savedColor = value
      savedColorRequest = request
    }
    if (request === colorRequest) {
      latestColorFailed = failed
      status.textContent = failed
        ? 'Could not save this color. Please try again.'
        : 'Saved for all GitHub profiles.'
    }
    if (latestColorFailed) {
      currentColor = savedColor
      showColor(savedColor)
    }
  })
}

// Dragging in the color picker fires input events continuously, and every
// save recolors and redraws each open GitHub profile. Preview instantly, but
// save at most once per interval and always save the final color.
const COLOR_SAVE_INTERVAL = 150
let queuedColor = null
let colorTimer = null

const saveQueuedColor = () => {
  if (queuedColor === null) return false
  const value = queuedColor
  queuedColor = null
  chooseColor(value)
  return true
}

const startColorTimer = () => {
  colorTimer = setTimeout(() => {
    colorTimer = null
    if (saveQueuedColor()) startColorTimer()
  }, COLOR_SAVE_INTERVAL)
}

const flushColor = () => {
  clearTimeout(colorTimer)
  colorTimer = null
  saveQueuedColor()
}

colorInput.addEventListener('input', () => {
  queuedColor = normalizeContributionColor(colorInput.value)
  showColor(queuedColor)
  if (colorTimer) return
  saveQueuedColor()
  startColorTimer()
})
colorInput.addEventListener('change', flushColor)
globalThis.addEventListener('pagehide', flushColor)
document.getElementById('reset-color').addEventListener('click', () => {
  clearTimeout(colorTimer)
  colorTimer = null
  queuedColor = null
  chooseColor(DEFAULT_CONTRIBUTION_COLOR)
})
theme?.addEventListener('change', () => showColor(currentColor))

const option = (type, name, value, { label, summary }) => {
  const container = document.createElement('label')
  container.className = 'scale-option'
  const input = document.createElement('input')
  input.type = type
  input.name = name
  input.value = value
  const text = document.createElement('span')
  const title = document.createElement('strong')
  title.textContent = label
  const description = document.createElement('small')
  description.textContent = summary
  text.append(title, description)
  container.append(input, text)
  return container
}

for (const [value, view] of Object.entries(VIEWS)) {
  viewOptions.append(option('checkbox', 'views', value, view))
}

const checkedViews = () =>
  [...viewOptions.querySelectorAll('input:checked')].map((input) => input.value)

const showViews = (views) => {
  for (const input of viewOptions.querySelectorAll('input')) {
    input.checked = views.includes(input.value)
  }
}

viewOptions.addEventListener('change', (event) => {
  // Keep the last enabled view on instead of greying it out.
  if (!checkedViews().length) {
    event.target.checked = true
    status.textContent = 'At least one view stays on.'
    return
  }
  const views = normalizeViews(checkedViews())
  const request = ++viewRequest
  status.textContent = 'Saving…'
  chrome.storage.local.set({ views }, () => {
    const failed = Boolean(chrome.runtime.lastError)
    if (!failed && request > savedViewRequest) {
      savedViews = views
      savedViewRequest = request
    }
    if (request !== viewRequest) return
    if (failed) {
      showViews(savedViews)
      status.textContent = 'Could not save your views. Please try again.'
    } else {
      status.textContent = 'Saved for all GitHub profiles.'
    }
  })
})

const showSelection = (value) => {
  for (const input of options.querySelectorAll('input')) {
    input.checked = input.value === value
  }
}

for (const [value, scale] of Object.entries(HEIGHT_SCALES)) {
  options.append(option('radio', 'heightScale', value, scale))
}

chrome.storage.local.get(
  ['heightScale', 'contributionColor', 'views', 'toggleSetting'],
  (settings) => {
    if (chrome.runtime.lastError) {
      status.textContent = 'Could not load settings. Please reopen this menu.'
      return
    }
    savedScale = normalizeHeightScale(settings.heightScale)
    savedViews = normalizeViews(settings.views, settings.toggleSetting)
    savedColor = normalizeContributionColor(settings.contributionColor)
    currentColor = savedColor
    showSelection(savedScale)
    showViews(savedViews)
    showColor(savedColor)
    for (const group of document.querySelectorAll('fieldset')) {
      group.disabled = false
    }
    status.textContent =
      'Applies to all GitHub profiles. Changes save automatically.'
  }
)

options.addEventListener('change', (event) => {
  const value = event.target.value
  if (!Object.hasOwn(HEIGHT_SCALES, value) || value === savedScale) return
  const restoreFocus = document.activeElement === event.target
  fieldset.disabled = true
  status.textContent = 'Saving…'
  chrome.storage.local.set({ heightScale: value }, () => {
    fieldset.disabled = false
    if (chrome.runtime.lastError) {
      showSelection(savedScale)
      status.textContent = 'Could not save this setting. Please try again.'
    } else {
      savedScale = value
      status.textContent = 'Saved for all GitHub profiles.'
    }
    if (restoreFocus) {
      options.querySelector('input:checked').focus()
    }
  })
})
