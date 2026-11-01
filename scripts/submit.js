#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { pnpmCommand } from './pnpm.js'
import {
  ARTIFACT_NAMES,
  assertFirefoxIdentity,
  EXTENSION_NAME,
  FIREFOX_ADDON_ID,
  requirePublishingConfig
} from './publishing-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const artifactsDir = path.join(rootDir, 'artifacts')

const usage =
  'Usage: pnpm run submit:<chrome|firefox|firefox:metadata|edge|all> [--dry-run|--check-config|--preflight]'
let args
try {
  args = parseArgs({
    options: {
      'dry-run': { type: 'boolean' },
      'check-config': { type: 'boolean' },
      preflight: { type: 'boolean' }
    },
    allowPositionals: true
  })
} catch (error) {
  console.error(error.message)
  console.error(usage)
  process.exit(1)
}
if (
  args.positionals.length !== 1 ||
  Object.values(args.values).filter(Boolean).length > 1
) {
  console.error(usage)
  process.exit(1)
}
const target = args.positionals[0]
const dryRun = Boolean(args.values['dry-run'])

function checkEnvVars(vars) {
  const missing = vars.filter((v) => !process.env[v])
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
    process.exit(1)
  }

  if (dryRun) {
    console.log(`  ✓ Environment variables present: ${vars.join(', ')}`)
  }
}

function checkArtifact(zipName) {
  const zipPath = path.join(artifactsDir, zipName)
  if (!fs.existsSync(zipPath)) {
    console.error(`Artifact not found: ${zipPath}`)
    console.error('Run "pnpm run build:all" first')
    process.exit(1)
  }

  if (dryRun) {
    console.log(`  ✓ Artifact exists: ${zipName}`)
  }

  return zipPath
}

function checkSubmissionArtifacts(target) {
  const browsers = target === 'all' ? Object.keys(ARTIFACT_NAMES) : [target]
  for (const browser of browsers) {
    if (browser === 'firefox-metadata') continue
    checkArtifact(ARTIFACT_NAMES[browser])
    if (browser === 'firefox') {
      assertFirefoxIdentity(
        JSON.parse(
          fs.readFileSync(path.join(rootDir, 'dist', 'manifest.json'), 'utf8')
        )
      )
    }
  }
}

function createMozillaJwt(apiKey, apiSecret) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsignedToken = [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      iss: apiKey,
      jti: randomUUID(),
      iat: issuedAt,
      exp: issuedAt + 60
    })
  ].join('.')
  const signature = createHmac('sha256', apiSecret)
    .update(unsignedToken)
    .digest('base64url')

  return `${unsignedToken}.${signature}`
}

async function verifyFirefoxListing() {
  const token = createMozillaJwt(
    process.env.AMO_API_KEY,
    process.env.AMO_API_SECRET
  )
  const response = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(process.env.FIREFOX_ADDON_SLUG)}/`,
    { method: 'GET', headers: { Authorization: `JWT ${token}` } }
  )
  if (!response.ok) {
    throw new Error(
      `Firefox listing verification failed (${response.status}); check FIREFOX_ADDON_SLUG and AMO credentials. See PUBLISHING.md.`
    )
  }
  const listing = await response.json()
  if (listing.guid !== FIREFOX_ADDON_ID) {
    throw new Error(
      `FIREFOX_ADDON_SLUG does not resolve to the Plus add-on ID (${FIREFOX_ADDON_ID}). Refusing store submission or metadata changes; see PUBLISHING.md.`
    )
  }
}

async function updateFirefoxListingName() {
  console.log(`Updating Firefox listing name to "${EXTENSION_NAME}"...`)
  const token = createMozillaJwt(
    process.env.AMO_API_KEY,
    process.env.AMO_API_SECRET
  )
  // Pin the write to the verified immutable ID, not a mutable listing slug.
  const response = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(FIREFOX_ADDON_ID)}/`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `JWT ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: { 'en-US': EXTENSION_NAME } })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Firefox listing update failed (${response.status}): ${errorText}`
    )
  }

  const updatedListing = await response.json()
  const updatedName = updatedListing.name?.['en-US']
  if (updatedName !== EXTENSION_NAME) {
    throw new Error(
      `Firefox returned an unexpected listing name: ${updatedName || 'missing'}`
    )
  }

  console.log('✓ Firefox listing name updated')
}

async function submitChrome() {
  console.log('\n=== Chrome Web Store ===\n')

  checkEnvVars([
    'CHROME_PUBLISHER_ID',
    'CHROME_EXTENSION_ID',
    'CHROME_CLIENT_ID',
    'CHROME_CLIENT_SECRET',
    'CHROME_REFRESH_TOKEN'
  ])
  const zipPath = path.join(artifactsDir, ARTIFACT_NAMES.chrome)

  if (dryRun) {
    console.log('  Configuration present; credentials have not been verified.')
    console.log('\n  [DRY RUN] Would upload:', zipPath)
    return
  }

  const args = ['chrome-webstore-upload', '--source', zipPath]

  try {
    execFileSync(...pnpmCommand(['exec', ...args]), {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        EXTENSION_ID: process.env.CHROME_EXTENSION_ID,
        PUBLISHER_ID: process.env.CHROME_PUBLISHER_ID,
        CLIENT_ID: process.env.CHROME_CLIENT_ID,
        CLIENT_SECRET: process.env.CHROME_CLIENT_SECRET,
        REFRESH_TOKEN: process.env.CHROME_REFRESH_TOKEN
      }
    })
  } catch (error) {
    if (error.message?.includes('PKG_INVALID_VERSION_NUMBER')) {
      console.log(
        '\n⚠ Version already published to Chrome Web Store — skipping\n'
      )
      return
    }

    throw error
  }

  console.log('\n✓ Chrome Web Store submission complete\n')
}

async function submitFirefox() {
  console.log('\n=== Firefox Add-ons ===\n')

  checkEnvVars(['FIREFOX_ADDON_SLUG', 'AMO_API_KEY', 'AMO_API_SECRET'])

  if (dryRun) {
    console.log('  Validating credentials...')
    // Web-ext doesn't have a validate-only mode, but we can check the JWT format
    const apiKey = process.env.AMO_API_KEY
    const apiSecret = process.env.AMO_API_SECRET
    if (apiKey?.startsWith('user:') && apiSecret && apiSecret.length > 20) {
      console.log('  ✓ Credentials format looks valid')
    } else {
      console.log(
        '  ⚠ Credentials format may be incorrect (expected JWT issuer starting with "user:")'
      )
    }

    console.log('\n  [DRY RUN] Would submit to Firefox Add-ons')
    return
  }

  const args = [
    'web-ext',
    'sign',
    '--channel',
    'listed',
    '--source-dir',
    path.join(rootDir, 'dist'),
    '--artifacts-dir',
    artifactsDir
  ]

  try {
    execFileSync(...pnpmCommand(['exec', ...args]), {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        WEB_EXT_API_KEY: process.env.AMO_API_KEY,
        WEB_EXT_API_SECRET: process.env.AMO_API_SECRET
      }
    })
  } catch (error) {
    if (error.message?.includes('Version already exists')) {
      console.log(
        '\n⚠ Version already published to Firefox Add-ons — skipping\n'
      )
    } else {
      throw error
    }
  }

  await updateFirefoxListingName()
  console.log('\n✓ Firefox Add-ons submission complete\n')
}

async function updateFirefoxMetadata() {
  console.log('\n=== Firefox Add-ons Metadata ===\n')
  checkEnvVars(['FIREFOX_ADDON_SLUG', 'AMO_API_KEY', 'AMO_API_SECRET'])

  if (dryRun) {
    console.log(`  [DRY RUN] Would set listing name to "${EXTENSION_NAME}"`)
    return
  }

  await updateFirefoxListingName()
  console.log('\n✓ Firefox Add-ons metadata update complete\n')
}

async function submitEdge() {
  console.log('\n=== Microsoft Edge Add-ons ===\n')

  checkEnvVars(['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'])
  const zipPath = path.join(artifactsDir, ARTIFACT_NAMES.edge)

  if (dryRun) {
    console.log(
      '  ✓ Credentials present (Edge validates them during package upload)'
    )

    console.log('\n  [DRY RUN] Would upload:', zipPath)
    return
  }

  execFileSync(process.execPath, ['scripts/submit-edge.js'], {
    cwd: rootDir,
    stdio: 'inherit'
  })

  console.log('\n✓ Edge Add-ons submission complete\n')
}

async function submitAll() {
  await submitChrome()
  await submitFirefox()
  await submitEdge()
  if (dryRun) {
    console.log('\n=== Dry run complete - all checks passed ===\n')
  } else {
    console.log('=== All submissions complete ===\n')
  }
}

const handlers = {
  chrome: submitChrome,
  firefox: submitFirefox,
  'firefox-metadata': updateFirefoxMetadata,
  edge: submitEdge,
  all: submitAll
}

if (!Object.hasOwn(handlers, target)) {
  console.error(`Unknown target: ${target}`)
  console.error(usage)
  process.exit(1)
}

if (dryRun) {
  console.log('🧪 OFFLINE DRY RUN - checking configuration and artifacts\n')
}

async function main() {
  requirePublishingConfig(target)
  if (args.values['check-config']) {
    console.log('Fork publishing configuration is present (not verified).')
    return
  }
  checkSubmissionArtifacts(target)
  if (!dryRun && ['firefox', 'firefox-metadata', 'all'].includes(target)) {
    await verifyFirefoxListing()
  }
  if (args.values.preflight) {
    console.log(
      'Store preflight passed; no upload or metadata change was performed.'
    )
    return
  }
  await handlers[target]()
}

main().catch((error) => {
  console.error('Submission failed:', error.message)
  process.exit(1)
})
