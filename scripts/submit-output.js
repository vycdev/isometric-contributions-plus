import { spawn } from 'node:child_process'
import process from 'node:process'

/**
 * Run a store tool, showing its output live while keeping a copy. The copy is
 * what lets callers recognize store responses such as "version already
 * published"; with inherited stdio the error only says "Command failed".
 * Resolves on exit code 0; otherwise rejects with an error whose `output`
 * holds everything the tool printed.
 */
export const runAndCapture = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      ...options,
      stdio: ['inherit', 'pipe', 'pipe']
    })
    let output = ''
    const forward = (target) => (chunk) => {
      output += chunk
      target.write(chunk)
    }
    child.stdout.on('data', forward(options.stdout ?? process.stdout))
    child.stderr.on('data', forward(options.stderr ?? process.stderr))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve(output)
        return
      }
      const error = new Error(
        `${[file, ...args].join(' ')} exited with ${signal ?? `code ${code}`}`
      )
      error.output = output
      reject(error)
    })
  })

const ALREADY_PUBLISHED = {
  // Chrome Web Store: PKG_INVALID_VERSION_NUMBER, or the message explaining
  // that the uploaded version must be higher than the published one.
  chrome:
    /PKG_INVALID_VERSION_NUMBER|invalid version number|version[^\n]*(?:already|not (?:greater|higher)|must be (?:greater|higher))/i,
  // Firefox Add-ons (via web-ext sign): "Version 1.2.8 already exists."
  firefox: /version(?:\s+\S+)?\s+already exists/i
}

/** Whether a failed upload only means this version is already in the store. */
export const isAlreadyPublished = (store, error) =>
  ALREADY_PUBLISHED[store].test(
    `${error?.output ?? ''}\n${error?.message ?? ''}`
  )
