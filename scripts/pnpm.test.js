import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { pnpmCommand } from './pnpm.js'

test('installed store tools run through pnpm exec without credentials', () => {
  const help = execFileSync(
    ...pnpmCommand(['exec', 'chrome-webstore-upload', '--help']),
    { encoding: 'utf8' }
  )
  assert.match(help, /chrome-webstore-upload \[command\]/)
  const version = execFileSync(
    ...pnpmCommand(['exec', 'web-ext', '--version']),
    {
      encoding: 'utf8'
    }
  )
  assert.match(version.trim(), /^\d+\.\d+\.\d+$/)
})

test('pnpm subprocesses preserve arguments and exit codes without a shell', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnpm helper '))
  const cli = path.join(dir, 'pnpm.cjs')
  const original = process.env.npm_execpath
  try {
    fs.writeFileSync(
      cli,
      'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode = Number(process.env.TEST_EXIT_CODE || 0)'
    )
    process.env.npm_execpath = cli
    const args = [
      'exec',
      'tool',
      'path with spaces',
      'a&b',
      '$value',
      '"quoted"'
    ]
    const result = execFileSync(...pnpmCommand(args), { encoding: 'utf8' })
    assert.deepEqual(JSON.parse(result), args)

    const child = spawn(...pnpmCommand(args), {
      env: { ...process.env, TEST_EXIT_CODE: '7' },
      stdio: 'ignore'
    })
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })
    assert.equal(code, 7)

    process.env.npm_execpath = path.join(dir, 'npm-cli.js')
    assert.throws(() => pnpmCommand(args), /pnpm run script/)
    delete process.env.npm_execpath
    assert.throws(() => pnpmCommand(args), /pnpm run script/)
  } finally {
    if (original === undefined) delete process.env.npm_execpath
    else process.env.npm_execpath = original
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
