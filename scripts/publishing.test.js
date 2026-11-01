import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createSafariSigningFiles } from './configure-safari.js'
import {
  ARTIFACT_NAMES,
  assertFirefoxIdentity,
  EXTENSION_NAME,
  FIREFOX_ADDON_ID,
  requirePublishingConfig,
  SAFARI_BUNDLE_ID,
  transformForFirefox
} from './publishing-config.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const browserConfig = {
  CHROME_PUBLISHER_ID: 'test-plus-publisher',
  CHROME_EXTENSION_ID: 'test-plus-extension',
  CHROME_CLIENT_ID: 'test-client',
  CHROME_CLIENT_SECRET: 'test-secret',
  CHROME_REFRESH_TOKEN: 'test-token',
  FIREFOX_ADDON_SLUG: 'test-plus-listing',
  AMO_API_KEY: 'user:test',
  AMO_API_SECRET: 'test-secret-for-offline-validation',
  EDGE_PRODUCT_ID: 'test-plus-product',
  EDGE_CLIENT_ID: 'test-client',
  EDGE_API_KEY: 'test-key'
}
const safariConfig = {
  APPLE_TEAM_ID: 'TESTTEAM01',
  APPLE_SIGNING_IDENTITY: 'Apple Distribution: Test Maintainer (TESTTEAM01)',
  APPLE_INSTALLER_IDENTITY:
    '3rd Party Mac Developer Installer: Test Maintainer',
  APPLE_APP_PROFILE_NAME: 'Plus App & Distribution',
  APPLE_EXTENSION_PROFILE_NAME: 'Plus Extension & Distribution'
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plus publishing test '))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.mkdirSync(path.join(dir, 'scripts'))
  fs.mkdirSync(path.join(dir, 'artifacts'))
  fs.mkdirSync(path.join(dir, 'dist'))
  fs.mkdirSync(path.join(dir, 'safari'))
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}')
  for (const file of [
    'submit.js',
    'publishing-config.js',
    'configure-safari.js'
  ]) {
    fs.copyFileSync(
      path.join(root, 'scripts', file),
      path.join(dir, 'scripts', file)
    )
  }
  fs.copyFileSync(
    path.join(root, 'safari', 'ExportOptions.template.plist'),
    path.join(dir, 'safari', 'ExportOptions.template.plist')
  )
  for (const name of Object.values(ARTIFACT_NAMES)) {
    fs.writeFileSync(path.join(dir, 'artifacts', name), 'offline fixture')
  }
  fs.writeFileSync(
    path.join(dir, 'dist', 'manifest.json'),
    JSON.stringify(
      transformForFirefox({ name: EXTENSION_NAME, version: '1.2.8' })
    )
  )
  return dir
}

// Every child gets only dummy publisher values. Any unplanned network/CLI call
// fails locally, even if the developer has real store credentials configured.
function runSubmit(dir, args, overrides = {}, intercept = false) {
  const env = { ...process.env }
  for (const name of [
    ...Object.keys(browserConfig),
    ...Object.keys(safariConfig)
  ]) {
    delete env[name]
  }
  Object.assign(env, browserConfig, overrides)
  const hook = `
    import cp from 'node:child_process';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const calls = [];
    function record(call) {
      calls.push(call);
      fs.writeFileSync('calls.json', JSON.stringify(calls));
    }
    cp.execFileSync = (command, args, options) => {
      if (!${intercept}) throw new Error('Unexpected external process');
      record({ command, args, publisher: options?.env?.PUBLISHER_ID });
    };
    syncBuiltinESMExports();
    globalThis.fetch = async (url, options) => {
      if (!${intercept}) throw new Error('Unexpected network request');
      record({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ name: { 'en-US': ${JSON.stringify(EXTENSION_NAME)} } }) };
    };
  `
  return spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript;base64,${Buffer.from(hook).toString('base64')}`,
      'scripts/submit.js',
      ...args
    ],
    { cwd: dir, env, encoding: 'utf8' }
  )
}

test('every publishing target rejects missing and whitespace-only configuration', () => {
  for (const target of [
    'chrome',
    'firefox',
    'firefox-metadata',
    'edge',
    'all',
    'safari'
  ]) {
    assert.throws(
      () => requirePublishingConfig(target, {}),
      /Missing fork publishing configuration:.*PUBLISHING.md/
    )
  }
  assert.throws(
    () =>
      requirePublishingConfig('chrome', {
        ...browserConfig,
        CHROME_PUBLISHER_ID: '  '
      }),
    /CHROME_PUBLISHER_ID/
  )
  assert.throws(
    () =>
      requirePublishingConfig('firefox-metadata', {
        ...browserConfig,
        FIREFOX_ADDON_SLUG: ''
      }),
    /FIREFOX_ADDON_SLUG/
  )
})

test('Firefox conversion preserves popup, permissions and homepage with the fork ID', () => {
  const original = JSON.parse(
    fs.readFileSync(path.join(root, 'src', 'manifest.json'), 'utf8')
  )
  const converted = transformForFirefox(original)
  assert.equal(original.manifest_version, 3)
  assert.equal(converted.manifest_version, 2)
  assert.equal(converted.name, EXTENSION_NAME)
  assert.equal(converted.browser_specific_settings.gecko.id, FIREFOX_ADDON_ID)
  assert.deepEqual(converted.browser_action, original.action)
  assert.deepEqual(converted.permissions, [
    ...original.permissions,
    ...original.host_permissions
  ])
  assert.equal(converted.homepage_url, original.homepage_url)
  assert.equal(converted.action, undefined)
  assert.equal(converted.host_permissions, undefined)
  assertFirefoxIdentity(converted)
  assert.throws(() => assertFirefoxIdentity(original), /build:firefox/)
  assert.throws(
    () => assertFirefoxIdentity({ ...converted, name: 'Other extension' }),
    /Plus/
  )
})

test('all-store preflight fails before any process or network call', (t) => {
  const dir = fixture(t)
  const result = runSubmit(dir, ['all'], { FIREFOX_ADDON_SLUG: '' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /FIREFOX_ADDON_SLUG/)
  assert.doesNotMatch(result.stdout, /Chrome Web Store/)
  assert.equal(fs.existsSync(path.join(dir, 'calls.json')), false)
})

test('configured dry runs and config checks perform no external actions', (t) => {
  const dir = fixture(t)
  for (const args of [
    ['all', '--dry-run'],
    ['firefox-metadata', '--dry-run'],
    ['all', '--check-config']
  ]) {
    const result = runSubmit(dir, args)
    assert.equal(result.status, 0, result.stderr)
  }
  assert.equal(fs.existsSync(path.join(dir, 'calls.json')), false)
})

test('submission forwards the configured Chrome publisher and Firefox listing', (t) => {
  const dir = fixture(t)
  const chrome = runSubmit(dir, ['chrome'], {}, true)
  assert.equal(chrome.status, 0, chrome.stderr)
  const [upload] = JSON.parse(
    fs.readFileSync(path.join(dir, 'calls.json'), 'utf8')
  )
  assert.equal(upload.publisher, browserConfig.CHROME_PUBLISHER_ID)
  assert.ok(upload.args.some((arg) => arg.endsWith(ARTIFACT_NAMES.chrome)))
  const firefox = runSubmit(
    dir,
    ['firefox'],
    { FIREFOX_ADDON_SLUG: 'plus/test listing' },
    true
  )
  assert.equal(firefox.status, 0, firefox.stderr)
  const calls = JSON.parse(
    fs.readFileSync(path.join(dir, 'calls.json'), 'utf8')
  )
  assert.equal(calls[0].args[0], 'web-ext')
  assert.equal(
    calls[1].url,
    'https://addons.mozilla.org/api/v5/addons/addon/plus%2Ftest%20listing/'
  )
  assert.equal(calls[1].method, 'PATCH')
  assert.equal(calls[1].body.name['en-US'], EXTENSION_NAME)
})

test('Safari signing files keep profiles distinct, escape XML, and reject setting injection', (t) => {
  const dir = fixture(t)
  const { xcconfigPath, exportOptionsPath } = createSafariSigningFiles(
    dir,
    safariConfig
  )
  const xcconfig = fs.readFileSync(xcconfigPath, 'utf8')
  const plist = fs.readFileSync(exportOptionsPath, 'utf8')
  assert.match(xcconfig, /IC_APP_PROFILE_NAME = Plus App & Distribution/)
  assert.match(
    xcconfig,
    /IC_EXTENSION_PROFILE_NAME = Plus Extension & Distribution/
  )
  assert.ok(plist.includes(`<key>${SAFARI_BUNDLE_ID}</key>`))
  assert.ok(plist.includes(`<key>${SAFARI_BUNDLE_ID}.Extension</key>`))
  assert.match(plist, /Plus App &amp; Distribution/)
  assert.doesNotMatch(plist, /__[A-Z_]+__/)
  assert.throws(
    () =>
      createSafariSigningFiles(dir, {
        ...safariConfig,
        APPLE_APP_PROFILE_NAME: 'bad\nSETTING=1'
      }),
    /Invalid APPLE_APP_PROFILE_NAME/
  )
})

test('unconfigured Safari release fails before Parcel or Xcode', () => {
  const env = { ...process.env }
  for (const name of Object.keys(safariConfig)) delete env[name]
  const result = spawnSync(
    process.execPath,
    ['scripts/build-safari.js', '--release'],
    {
      cwd: root,
      env,
      encoding: 'utf8'
    }
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /APPLE_TEAM_ID.*PUBLISHING.md/)
  assert.doesNotMatch(result.stdout, /Parcel|Xcode/)
})

test('Safari resource sync refreshes manifest identity and resolves the copied popup assets', (t) => {
  const dir = fixture(t)
  fs.copyFileSync(
    path.join(root, 'scripts', 'build-safari.js'),
    path.join(dir, 'scripts', 'build-safari.js')
  )
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(
    path.join(dir, 'src', 'obelisk.min.js'),
    '/*! Original dependency notice */\n'
  )
  const resources = path.join(
    dir,
    'safari',
    'Isometric Contributions',
    'Isometric Contributions Extension',
    'Resources'
  )
  fs.mkdirSync(resources, { recursive: true })
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'src', 'manifest.json'), 'utf8')
  )
  const names = [
    'iso.js',
    'iso.css',
    'obelisk.min.js',
    'icon-48.png',
    'icon-128.png',
    'popup.html',
    'popup.js',
    'popup.css'
  ]
  let builtManifest = JSON.stringify(manifest)
  for (const name of names) {
    const hashed = name.replace(/(\.[^.]+)$/, '.testhash$1')
    builtManifest = builtManifest.replaceAll(name, hashed)
    let content = '/* offline build fixture */'
    if (name === 'popup.html')
      content =
        '<h1>Isometric Contributions Plus</h1><script src="/popup.testhash.js"></script><link href="/popup.testhash.css"><img src="/icon-48.testhash.png">'
    fs.writeFileSync(path.join(dir, 'dist', hashed), content)
  }
  fs.writeFileSync(path.join(dir, 'dist', 'manifest.json'), builtManifest)
  fs.renameSync(path.join(dir, 'dist'), path.join(dir, 'parcel-output'))
  fs.mkdirSync(path.join(dir, 'dist'))
  fs.writeFileSync(
    path.join(dir, 'dist', 'manifest.json'),
    JSON.stringify(transformForFirefox(manifest))
  )
  const hook = `import cp from 'node:child_process'; import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module'; cp.execSync = () => fs.cpSync('parcel-output', 'dist', { recursive: true }); cp.execFileSync = () => { throw new Error('Unexpected Xcode invocation') }; syncBuiltinESMExports();`
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript;base64,${Buffer.from(hook).toString('base64')}`,
      'scripts/build-safari.js',
      '--resources-only'
    ],
    { cwd: dir, encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(resources, 'manifest.json'), 'utf8')),
    manifest
  )
  const popup = fs.readFileSync(path.join(resources, 'popup.html'), 'utf8')
  assert.doesNotMatch(popup, /testhash/)
  for (const name of names)
    assert.ok(fs.existsSync(path.join(resources, name)), name)
  assert.match(
    fs.readFileSync(path.join(resources, 'obelisk.min.js'), 'utf8'),
    /Original dependency notice/
  )
})
