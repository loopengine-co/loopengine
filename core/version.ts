// The installed loopengine version, for the console's Settings section.
// package.json sits one level above core/ in this repo, and two above
// dist/core/ in the published package (dist/package.json is only the
// module-resolution stub the build writes, with no version).
import { existsSync, readFileSync } from 'node:fs'

let cached: string | undefined

export function loopengineVersion(): string {
  if (cached) return cached
  for (const rel of ['../package.json', '../../package.json']) {
    const url = new URL(rel, import.meta.url)
    if (!existsSync(url)) continue
    try {
      const pkg = JSON.parse(readFileSync(url, 'utf8')) as { name?: string; version?: string }
      if (pkg.name === 'loopengine' && pkg.version) return (cached = pkg.version)
    } catch {
      // Not loopengine's package.json; try the next.
    }
  }
  return (cached = 'unknown')
}
