import process from 'node:process'

export const EXTENSION_NAME = 'Isometric Contributions Plus'
export const FIREFOX_ADDON_ID = 'isometric-contributions-plus@vycdev.github.io'
export const SAFARI_BUNDLE_ID = 'io.github.vycdev.isometric-contributions-plus'
export const ARTIFACT_NAMES = Object.fromEntries(
  ['chrome', 'edge', 'firefox'].map((browser) => [
    browser,
    `isometric-contributions-plus-${browser}.zip`
  ])
)

const required = {
  chrome: [
    'CHROME_PUBLISHER_ID',
    'CHROME_EXTENSION_ID',
    'CHROME_CLIENT_ID',
    'CHROME_CLIENT_SECRET',
    'CHROME_REFRESH_TOKEN'
  ],
  firefox: ['FIREFOX_ADDON_SLUG', 'AMO_API_KEY', 'AMO_API_SECRET'],
  edge: ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'],
  safari: [
    'APPLE_TEAM_ID',
    'APPLE_SIGNING_IDENTITY',
    'APPLE_INSTALLER_IDENTITY',
    'APPLE_APP_PROFILE_NAME',
    'APPLE_EXTENSION_PROFILE_NAME'
  ]
}

// Validate every selected store before any upload or metadata change can start.
export function requirePublishingConfig(target, env = process.env) {
  const targets = target === 'all' ? ['chrome', 'firefox', 'edge'] : [target]
  const names = targets.flatMap((store) => {
    const vars = required[store === 'firefox-metadata' ? 'firefox' : store]
    if (!vars) throw new Error(`Unknown publishing target: ${store}`)
    return vars
  })
  const missing = names.filter((name) => !env[name]?.trim())
  if (missing.length) {
    throw new Error(
      `Missing fork publishing configuration: ${missing.join(', ')}. See PUBLISHING.md; use accounts and listings owned by vycdev for Isometric Contributions Plus.`
    )
  }
  return Object.fromEntries(names.map((name) => [name, env[name]]))
}

export function transformForFirefox(manifest) {
  const v2 = { ...manifest, manifest_version: 2 }
  if (v2.action) {
    v2.browser_action = v2.action
    delete v2.action
  }
  if (v2.host_permissions) {
    v2.permissions = [...(v2.permissions || []), ...v2.host_permissions]
    delete v2.host_permissions
  }
  v2.browser_specific_settings = { gecko: { id: FIREFOX_ADDON_ID } }
  return v2
}

export function assertFirefoxIdentity(manifest) {
  if (
    manifest.name !== EXTENSION_NAME ||
    manifest.browser_specific_settings?.gecko?.id !== FIREFOX_ADDON_ID
  ) {
    throw new Error(
      'Firefox source must use the Plus name and add-on ID. Run "npm run build:firefox" immediately before submitting Firefox; see PUBLISHING.md.'
    )
  }
}
