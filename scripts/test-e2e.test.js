import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('E2E prepares pinned Chrome before building and propagates download failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e browser setup '))
  try {
    fs.mkdirSync(path.join(dir, 'scripts'))
    fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}')
    for (const file of ['pnpm.js', 'test-e2e.js']) {
      fs.copyFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        path.join(dir, 'scripts', file)
      )
    }
    const cli = path.join(dir, 'pnpm.cjs')
    fs.writeFileSync(
      cli,
      `const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n')
if (args.join(' ') === 'exec puppeteer browsers install chrome') {
  if (process.env.FAIL_DOWNLOAD === '1') process.exit(7)
  fs.writeFileSync('browser.ready', '')
} else if (args.join(' ') === 'run build:chrome') {
  if (!fs.existsSync('browser.ready')) throw new Error('Missing browser')
  fs.writeFileSync('build.ready', '')
} else throw new Error('Unexpected command')`
    )
    fs.writeFileSync(
      path.join(dir, 'test-extension.js'),
      `import fs from 'node:fs'
if (!fs.existsSync('build.ready')) throw new Error('Missing build')
fs.appendFileSync('calls.jsonl', JSON.stringify(['health-check']) + '\\n')`
    )
    const run = (extraEnv = {}) =>
      spawnSync(process.execPath, [path.join(dir, 'scripts', 'test-e2e.js')], {
        cwd: dir,
        env: { ...process.env, npm_execpath: cli, ...extraEnv },
        encoding: 'utf8'
      })
    const callsFile = path.join(dir, 'calls.jsonl')
    const readCalls = () =>
      fs.readFileSync(callsFile, 'utf8').trim().split('\n').map(JSON.parse)
    const install = ['exec', 'puppeteer', 'browsers', 'install', 'chrome']

    const success = run()
    assert.equal(success.status, 0, success.stderr)
    assert.deepEqual(readCalls(), [
      install,
      ['run', 'build:chrome'],
      ['health-check']
    ])

    for (const file of ['calls.jsonl', 'browser.ready', 'build.ready']) {
      fs.unlinkSync(path.join(dir, file))
    }
    const failure = run({ FAIL_DOWNLOAD: '1' })
    assert.equal(failure.status, 7, failure.stderr)
    assert.deepEqual(readCalls(), [install])
    assert.equal(fs.existsSync(path.join(dir, 'build.ready')), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
