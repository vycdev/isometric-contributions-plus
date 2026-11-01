#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  requirePublishingConfig,
  SAFARI_BUNDLE_ID
} from './publishing-config.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function createSafariSigningFiles(root = rootDir, env = process.env) {
  const config = requirePublishingConfig('safari', env)
  for (const [name, value] of Object.entries(config)) {
    if (/[\r\n"\\$;#]/.test(value) || value.includes('//')) {
      throw new Error(
        `Invalid ${name}: expected a single literal Xcode setting.`
      )
    }
  }
  const outputDir = path.join(root, '.deriveddata-safari')
  const xcconfigPath = path.join(outputDir, 'Signing.xcconfig')
  const exportOptionsPath = path.join(outputDir, 'ExportOptions.plist')
  const settings = {
    DEVELOPMENT_TEAM: config.APPLE_TEAM_ID,
    CODE_SIGN_STYLE: 'Manual',
    CODE_SIGN_IDENTITY: config.APPLE_SIGNING_IDENTITY,
    IC_APP_PROFILE_NAME: config.APPLE_APP_PROFILE_NAME,
    IC_EXTENSION_PROFILE_NAME: config.APPLE_EXTENSION_PROFILE_NAME
  }
  const escapeXml = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  const replacements = { ...config, SAFARI_BUNDLE_ID }
  const template = fs.readFileSync(
    path.join(root, 'safari', 'ExportOptions.template.plist'),
    'utf8'
  )
  const plist = template.replace(/__([A-Z_]+)__/g, (_, name) => {
    if (!replacements[name]) throw new Error(`Unknown export setting: ${name}`)
    return escapeXml(replacements[name])
  })
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(
    xcconfigPath,
    `${Object.entries(settings)
      .map(([name, value]) => `${name} = ${value}`)
      .join('\n')}\n`
  )
  fs.writeFileSync(exportOptionsPath, plist)
  return { xcconfigPath, exportOptionsPath }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    createSafariSigningFiles()
    console.log('Generated local Safari signing files in .deriveddata-safari/.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
