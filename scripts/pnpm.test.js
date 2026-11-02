import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
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

    // Exercise a real native executable with a pnpm filename, rather than
    // passing the binary to Node as if it were a JavaScript CLI.
    const executable = path.join(
      dir,
      process.platform === 'win32' ? 'pnpm.exe' : 'pnpm'
    )
    fs.copyFileSync(process.execPath, executable)
    fs.chmodSync(executable, 0o755)
    process.env.npm_execpath = executable
    const native = spawnSync(
      ...pnpmCommand([
        '-e',
        'console.log(JSON.stringify(process.argv.slice(1))); process.exitCode = 7',
        '--',
        ...args
      ]),
      { encoding: 'utf8' }
    )
    assert.equal(native.error, undefined)
    assert.equal(native.status, 7)
    assert.deepEqual(JSON.parse(native.stdout), args)

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

test('helpers preserve existing outputs when pnpm is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnpm preflight '))
  try {
    fs.mkdirSync(path.join(dir, 'scripts'))
    fs.mkdirSync(path.join(dir, 'src'))
    fs.mkdirSync(path.join(dir, 'dist'))
    fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}')
    for (const file of [
      'pnpm.js',
      'publishing-config.js',
      'build.js',
      'version.js'
    ]) {
      fs.copyFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        path.join(dir, 'scripts', file)
      )
    }
    const manifest = '{"version":"1.2.3"}\n'
    const marker = path.join(dir, 'dist', 'previous-build.txt')
    fs.writeFileSync(path.join(dir, 'src', 'manifest.json'), manifest)
    fs.writeFileSync(marker, 'previous build')
    const env = { ...process.env }
    delete env.npm_execpath

    for (const args of [
      ['build.js', 'chrome'],
      ['version.js', 'patch']
    ]) {
      const result = spawnSync(
        process.execPath,
        [path.join(dir, 'scripts', args[0]), ...args.slice(1)],
        { env, encoding: 'utf8' }
      )
      assert.equal(result.status, 1)
      assert.match(result.stderr, /pnpm run script/)
      assert.equal(fs.readFileSync(marker, 'utf8'), 'previous build')
      assert.equal(
        fs.readFileSync(path.join(dir, 'src', 'manifest.json'), 'utf8'),
        manifest
      )
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
