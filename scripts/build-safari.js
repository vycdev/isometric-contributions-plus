#!/usr/bin/env node

import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { pnpmCommand } from './pnpm.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const safariDir = path.join(rootDir, 'safari', 'Isometric Contributions')
const xcodeproj = path.join(safariDir, 'Isometric Contributions.xcodeproj')
const resourcesDir = path.join(
  safariDir,
  'Isometric Contributions Extension',
  'Resources'
)
const derivedDataDir = path.join(rootDir, '.deriveddata-safari')

// Maps original source filenames to their roles for reverse-mapping
// Parcel hashes filenames like iso.js -> iso.55f8e426.js
const SOURCE_FILES = [
  'iso.js',
  'iso.css',
  'obelisk.min.js',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-128.png',
  'popup.html',
  'popup.js',
  'popup.css'
]

function syncResources() {
  console.log('Syncing Parcel output to Safari Resources...')

  const manifest = JSON.parse(
    fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8')
  )
  const assets = new Set([
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    ...(manifest.content_scripts || []).flatMap((script) => [
      ...(script.js || []),
      ...(script.css || [])
    ])
  ])
  if (manifest.action?.default_popup) {
    assets.add(manifest.action.default_popup)
    const popup = fs.readFileSync(
      path.join(distDir, manifest.action.default_popup),
      'utf8'
    )
    for (const [, asset] of popup.matchAll(/\b(?:src|href)=["']?([^"' >]+)/g)) {
      assets.add(asset.replace(/^\//, ''))
    }
  }

  // Build a map from hashed filenames back to original names
  const hashToOriginal = new Map()
  for (const hashedName of assets) {
    const original = SOURCE_FILES.find((f) => {
      const base = f.replace(/\.[^.]+$/, '')
      const ext = f.slice(f.lastIndexOf('.'))
      return hashedName.startsWith(base) && hashedName.endsWith(ext)
    })
    if (original) {
      hashToOriginal.set(hashedName, original)
    }
  }

  // Copy each built file to Resources with its original name
  for (const [hashed, original] of hashToOriginal) {
    const src = path.join(distDir, hashed)
    const dest = path.join(resourcesDir, original)
    if (fs.existsSync(src)) {
      if (/\.(html|js|css)$/.test(original)) {
        let content = fs.readFileSync(src, 'utf8')
        for (const [hashedName, originalName] of hashToOriginal) {
          content = content
            .replaceAll(`/${hashedName}`, originalName)
            .replaceAll(hashedName, originalName)
        }
        if (original.endsWith('.html')) {
          content = `${content.replace(/[\t ]+$/gm, '').trimEnd()}\n`
        }
        fs.writeFileSync(dest, content)
      } else {
        fs.copyFileSync(src, dest)
      }
      console.log(`  ${hashed} -> ${original}`)
    } else {
      console.error(`  WARNING: ${src} not found`)
    }
  }

  // Keep the checked-in manifest in sync, using the unhashed Safari filenames.
  const manifestText = JSON.stringify(
    manifest,
    (_key, value) => hashToOriginal.get(value) || value,
    2
  )
  fs.writeFileSync(
    path.join(resourcesDir, 'manifest.json'),
    `${manifestText}\n`
  )

  console.log('Resources synced.\n')
}

function buildXcode(configuration = 'Debug') {
  console.log(`Building Xcode project (${configuration})...\n`)

  const cmd = [
    'xcodebuild build',
    `-project "${xcodeproj}"`,
    '-scheme "Isometric Contributions"',
    `-configuration ${configuration}`,
    "-destination 'platform=macOS'",
    `-derivedDataPath "${derivedDataDir}"`
  ]

  // For Release builds in CI, allow signing overrides via env vars
  if (configuration === 'Release' && process.env.APPLE_SIGNING_IDENTITY) {
    cmd.push(
      'CODE_SIGN_STYLE=Manual',
      `CODE_SIGN_IDENTITY="${process.env.APPLE_SIGNING_IDENTITY}"`,
      `DEVELOPMENT_TEAM="${process.env.APPLE_TEAM_ID}"`,
      'OTHER_CODE_SIGN_FLAGS="--timestamp"'
    )
  }

  execSync(cmd.join(' \\\n  '), {
    cwd: safariDir,
    stdio: 'inherit'
  })
}

function buildParcel() {
  const command = pnpmCommand(['exec', 'parcel', 'build', 'src/manifest.json'])
  // Firefox packaging rewrites the output manifest. Clear it before Parcel
  // can reuse that cached output for Safari.
  fs.rmSync(distDir, { recursive: true, force: true })
  console.log('Running Parcel build...\n')
  execFileSync(...command, { cwd: rootDir, stdio: 'inherit' })
  console.log()
}

const configuration = process.argv.includes('--release') ? 'Release' : 'Debug'
const skipXcode = process.argv.includes('--resources-only')

buildParcel()
syncResources()

if (!skipXcode) {
  buildXcode(configuration)

  const appPath = path.join(
    derivedDataDir,
    'Build',
    'Products',
    configuration,
    'Isometric Contributions.app'
  )
  if (fs.existsSync(appPath)) {
    console.log(`\nBuild succeeded: ${appPath}`)
  }
}
