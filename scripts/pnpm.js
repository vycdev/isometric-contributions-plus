import path from 'node:path'
import process from 'node:process'

// Reuse the pnpm CLI running this script without invoking a .cmd shell on
// Windows. The standalone distribution is an executable rather than JavaScript.
export function pnpmCommand(args) {
  const cli = process.env.npm_execpath
  if (cli) {
    const name = path.basename(cli)
    if (/^pnpm\.c?js$/.test(name)) return [process.execPath, [cli, ...args]]
    if (/^pnpm(?:\.exe)?$/.test(name)) return [cli, args]
  }

  throw new Error('Run this helper through its pnpm run script.')
}
