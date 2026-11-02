import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pnpmCommand } from './pnpm.js'

test('Safari resources include the popup after a Firefox build', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser build order '))
  try {
    for (const name of ['src', 'scripts', 'package.json', '.parcelrc']) {
      fs.cpSync(path.join(root, name), path.join(dir, name), {
        recursive: true
      })
    }
    fs.symlinkSync(
      path.join(root, 'node_modules'),
      path.join(dir, 'node_modules'),
      'junction'
    )
    const resources = path.join(
      dir,
      'safari/Isometric Contributions/Isometric Contributions Extension/Resources'
    )
    fs.mkdirSync(resources, { recursive: true })
    execFileSync(...pnpmCommand(['run', 'build:firefox']), { cwd: dir })
    const manifestFile = path.join(dir, 'dist/manifest.json')
    assert.equal(JSON.parse(fs.readFileSync(manifestFile)).manifest_version, 2)

    execFileSync(...pnpmCommand(['run', 'build:safari', '--resources-only']), {
      cwd: dir
    })
    const manifest = JSON.parse(fs.readFileSync(manifestFile))
    assert.equal(manifest.manifest_version, 3)
    assert.ok(manifest.action.default_popup)
    const popup = fs.readFileSync(path.join(resources, 'popup.html'), 'utf8')
    assert.match(popup, /popup\.js/)
    assert.match(popup, /popup\.css/)
    for (const file of ['popup.js', 'popup.css']) {
      assert.ok(fs.statSync(path.join(resources, file)).size > 0)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
