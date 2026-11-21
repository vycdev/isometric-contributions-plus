import assert from 'node:assert/strict'
import process from 'node:process'
import { Writable } from 'node:stream'
import { test } from 'node:test'
import { isAlreadyPublished, runAndCapture } from './submit-output.js'

const sink = () => {
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      stream.text += chunk
      callback()
    }
  })
  stream.text = ''
  return stream
}

const node = (script, streams) =>
  runAndCapture(process.execPath, ['-e', script], streams)

test('store tool output is shown live and kept for inspection', async () => {
  const stdout = sink()
  const stderr = sink()
  const output = await node(
    'console.log("uploading"); console.error("warning")',
    { stdout, stderr }
  )
  assert.equal(stdout.text, 'uploading\n')
  assert.equal(stderr.text, 'warning\n')
  assert.match(output, /uploading/)
  assert.match(output, /warning/)
})

test('a failed upload rejects with everything the tool printed', async () => {
  const streams = { stdout: sink(), stderr: sink() }
  await assert.rejects(
    node(
      'console.error("Version 1.2.8 already exists."); process.exit(1)',
      streams
    ),
    (error) => {
      assert.match(error.message, /exited with code 1/)
      assert.match(error.output, /Version 1\.2\.8 already exists/)
      assert.equal(isAlreadyPublished('firefox', error), true)
      assert.equal(isAlreadyPublished('chrome', error), true)
      return true
    }
  )
})

test('recognizes each store’s already-published responses only', () => {
  const failed = (output) => ({ message: 'exited with code 1', output })
  for (const output of [
    "{ uploadState: 'FAILURE', itemError: [ { error_code: 'PKG_INVALID_VERSION_NUMBER' } ] }",
    '❌ Invalid version number in manifest: 1.2.8. Please make sure the newly uploaded package has a larger version.'
  ]) {
    assert.equal(isAlreadyPublished('chrome', failed(output)), true, output)
  }
  assert.equal(
    isAlreadyPublished(
      'firefox',
      failed('WebExtError: {"version":["Version 1.2.8 already exists."]}')
    ),
    true
  )
  for (const output of [
    '❌ Request had invalid authentication credentials.',
    'Error: Network request failed',
    ''
  ]) {
    assert.equal(isAlreadyPublished('chrome', failed(output)), false, output)
    assert.equal(isAlreadyPublished('firefox', failed(output)), false, output)
  }
})
