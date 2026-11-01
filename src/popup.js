import {
  applyContributionPalette,
  createContributionPalette,
  DEFAULT_CONTRIBUTION_COLOR,
  normalizeContributionColor
} from './palette.js'
import { HEIGHT_SCALES, normalizeHeightScale } from './settings.js'

const options = document.getElementById('height-scales')
const fieldset = options.closest('fieldset')
const colorInput = document.getElementById('contribution-color')
const colorValue = document.getElementById('color-value')
const preview = document.getElementById('palette-preview')
const status = document.getElementById('save-status')
const theme = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
let savedScale = 'linear'
let savedColor = DEFAULT_CONTRIBUTION_COLOR
let pendingColor = savedColor
let savingColor = false

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

// Keep the native picker usable during writes and coalesce rapid input events.
const saveColor = () => {
  if (savingColor || pendingColor === savedColor) return
  const value = pendingColor
  savingColor = true
  status.textContent = 'Saving…'
  chrome.storage.local.set({ contributionColor: value }, () => {
    savingColor = false
    if (chrome.runtime.lastError) {
      if (pendingColor === value) {
        pendingColor = savedColor
        showColor(savedColor)
      }
      status.textContent = 'Could not save this color. Please try again.'
    } else {
      savedColor = value
      status.textContent = 'Saved for all GitHub profiles.'
    }
    saveColor()
  })
}

const chooseColor = (value) => {
  pendingColor = normalizeContributionColor(value)
  showColor(pendingColor)
  saveColor()
}

colorInput.addEventListener('input', () => chooseColor(colorInput.value))
document.getElementById('reset-color').addEventListener('click', () => {
  chooseColor(DEFAULT_CONTRIBUTION_COLOR)
})
theme?.addEventListener('change', () => showColor(pendingColor))

const showSelection = (value) => {
  for (const input of options.querySelectorAll('input')) {
    input.checked = input.value === value
  }
}

for (const [value, { label, summary }] of Object.entries(HEIGHT_SCALES)) {
  const option = document.createElement('label')
  option.className = 'scale-option'
  const input = document.createElement('input')
  input.type = 'radio'
  input.name = 'heightScale'
  input.value = value
  const text = document.createElement('span')
  const title = document.createElement('strong')
  title.textContent = label
  const description = document.createElement('small')
  description.textContent = summary
  text.append(title, description)
  option.append(input, text)
  options.append(option)
}

chrome.storage.local.get(['heightScale', 'contributionColor'], (settings) => {
  if (chrome.runtime.lastError) {
    status.textContent = 'Could not load settings. Please reopen this menu.'
    return
  }
  savedScale = normalizeHeightScale(settings.heightScale)
  savedColor = normalizeContributionColor(settings.contributionColor)
  pendingColor = savedColor
  showSelection(savedScale)
  showColor(savedColor)
  for (const group of document.querySelectorAll('fieldset')) {
    group.disabled = false
  }
  status.textContent =
    'Applies to all GitHub profiles. Changes save automatically.'
})

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
