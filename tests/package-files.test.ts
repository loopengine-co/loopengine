import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// package.json's "files" lists what npm publishes, file by file. A module
// the package imports but "files" leaves out makes the published package
// fail to load (0.3.0 shipped without core/workflow-runs and two others),
// and nothing else notices: the tests run against the source, not the
// package. This follows every import from the package's entry points and
// checks each module reached is published.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { files: string[] }

const published = (distPath: string) =>
  pkg.files.some((entry) => entry === distPath || distPath.startsWith(entry.replace(/\/$/, '') + '/'))

/** A source file for an import spec from `from` (a .ts file), if it's one of ours. */
function resolveSource(spec: string, from: string): string | undefined {
  let base: string
  if (spec.startsWith('#')) base = join(root, spec.slice(1))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return undefined
  const stem = base.replace(/\.js$/, '')
  for (const candidate of [`${stem}.ts`, join(stem, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

function reachableModules(entries: string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    // Static imports and re-exports, and import('…') with a literal spec;
    // `import type` is erased, but its .d.ts still needs the module.
    for (const match of source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm)) {
      const target = resolveSource(match[1]!, file)
      if (target && !target.includes(`${join(root, 'tests')}`)) queue.push(target)
    }
  }
  return seen
}

describe('the published package', () => {
  it('includes every module its entry points import', () => {
    const entries = [join(root, 'index.ts'), join(root, 'bin', 'cli.ts')]
    const missing = [...reachableModules(entries)].flatMap((file) => {
      const dist = `dist/${relative(root, file).replace(/\.ts$/, '')}`
      return [`${dist}.js`, `${dist}.d.ts`].filter((path) => !published(path))
    })
    expect(missing).toEqual([])
  })
})
