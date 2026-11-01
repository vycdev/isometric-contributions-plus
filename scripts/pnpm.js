import path from 'node:path'
import process from 'node:process'

// Reuse the pnpm CLI running this script. Calling it through Node avoids .cmd
// shell quoting on Windows, including paths and arguments containing spaces.
export function pnpmCommand(args) {
  const cli = process.env.npm_execpath
  if (!cli || !/^pnpm\.c?js$/.test(path.basename(cli))) {
    throw new Error('Run this helper through its pnpm run script.')
  }

  return [process.execPath, [cli, ...args]]
}
