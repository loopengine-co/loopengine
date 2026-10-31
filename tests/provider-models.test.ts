import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MODELS_FILE_ENV, ModelKeyError, listProviderModels, readModelsFile } from '#web/global-config.js'

const ENV_VARS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'XAI_API_KEY', 'META_API_KEY']
let keyCount = 0

// A fresh key per test, so the ten-minute cache never answers for another test.
function setKey(envVar: string): string {
  const key = `sk-test-${++keyCount}-0123456789`
  process.env[envVar] = key
  return key
}

function fakeFetch(body: unknown, seen: Request[] = [], status = 200): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Request(input, init))
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

let dir: string

// Every test reads its own models file (none, unless it writes one), not
// the repo's models.yaml.
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-models-'))
  process.env[MODELS_FILE_ENV] = join(dir, 'models.yaml')
})

afterEach(() => {
  for (const envVar of ENV_VARS) delete process.env[envVar]
  delete process.env[MODELS_FILE_ENV]
  rmSync(dir, { recursive: true, force: true })
})

function writeModelsFile(yaml: string) {
  writeFileSync(join(dir, 'models.yaml'), yaml)
}

describe('models.yaml', () => {
  it("offers exactly the file's list for a provider in it, without a key or an API call", async () => {
    writeModelsFile('openai:\n  - gpt-5.5\n  - gpt-5.6-luna\n')
    const seen: Request[] = []

    const view = await listProviderModels('openai', { fetch: fakeFetch({}, seen) })

    expect(view).toEqual({ provider: 'openai', models: ['gpt-5.5', 'gpt-5.6-luna'] })
    expect(seen).toHaveLength(0)
  })

  it('uses the file over a live list, even with a key saved', async () => {
    setKey('DEEPSEEK_API_KEY')
    writeModelsFile('deepseek: [deepseek-v4-pro]\n')
    const seen: Request[] = []

    const view = await listProviderModels('deepseek', { fetch: fakeFetch({ object: 'list', data: [{ id: 'deepseek-flash', object: 'model', owned_by: 'deepseek' }] }, seen) })

    expect(view.models).toEqual(['deepseek-v4-pro'])
    expect(seen).toHaveLength(0)
  })

  it('lists a provider left out of the file the usual way', async () => {
    setKey('XAI_API_KEY')
    writeModelsFile('openai:\n  - gpt-5.5\n# xai:\n#   - grok-5\n')

    const view = await listProviderModels('xai', { fetch: fakeFetch({ object: 'list', data: [{ id: 'grok-5', object: 'model', created: 1, owned_by: 'xai' }] }) })

    expect(view).toEqual({ provider: 'xai', models: ['grok-5'] })
  })

  it('treats an empty entry as left out, and drops duplicates and padding', () => {
    writeModelsFile('openai:\nmeta:\n  - " muse-spark-1.3 "\n  - muse-spark-1.3\n')

    expect(readModelsFile()).toEqual({ models: { meta: ['muse-spark-1.3'] } })
  })

  it('reports a malformed file, ignores all of it, and still lists models', async () => {
    for (const [yaml, message] of [
      ['openai: [gpt-5.5\n', /isn't valid YAML/],
      ['- gpt-5.5\n', /map each provider/],
      ['acme:\n  - x\n', /unknown provider 'acme'/],
      ['openai: gpt-5.5\n', /'openai' should be a list/],
    ] as const) {
      writeModelsFile(yaml)
      expect(readModelsFile().models).toEqual({})
      expect(readModelsFile().error).toMatch(message)
    }

    writeModelsFile('acme:\n  - x\n')
    const view = await listProviderModels('anthropic')
    expect(view.models).toContain('claude-sonnet-5')
    expect(view.error).toMatch(/unknown provider 'acme'/)
  })
})

describe('listProviderModels', () => {
  it('lists Anthropic models in the order Anthropic returns them, with the saved key', async () => {
    const key = setKey('ANTHROPIC_API_KEY')
    const seen: Request[] = []
    const body = {
      data: [
        { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' },
        { type: 'model', id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', created_at: '2026-03-01T00:00:00Z' },
      ],
      has_more: false,
      first_id: 'claude-opus-5-5',
      last_id: 'claude-sonnet-5',
    }

    const view = await listProviderModels('anthropic', { fetch: fakeFetch(body, seen) })

    expect(view).toEqual({ provider: 'anthropic', models: ['claude-opus-5-5', 'claude-sonnet-5'] })
    expect(new URL(seen[0].url).pathname).toBe('/v1/models')
    expect(seen[0].headers.get('x-api-key')).toBe(key)
  })

  it('lists OpenAI chat models newest first and leaves out embeddings, audio and images', async () => {
    setKey('OPENAI_API_KEY')
    const body = {
      object: 'list',
      data: [
        { id: 'gpt-5.5', object: 'model', created: 200, owned_by: 'openai' },
        { id: 'text-embedding-3-large', object: 'model', created: 300, owned_by: 'openai' },
        { id: 'gpt-5.6-luna', object: 'model', created: 400, owned_by: 'openai' },
        { id: 'whisper-1', object: 'model', created: 100, owned_by: 'openai' },
        { id: 'gpt-image-2', object: 'model', created: 500, owned_by: 'openai' },
      ],
    }

    const view = await listProviderModels('openai', { fetch: fakeFetch(body) })

    expect(view.models).toEqual(['gpt-5.6-luna', 'gpt-5.5'])
  })

  it("strips Gemini's models/ prefix and asks Google's OpenAI-compatible endpoint", async () => {
    setKey('GEMINI_API_KEY')
    const seen: Request[] = []
    const body = {
      object: 'list',
      data: [
        { id: 'models/gemini-3-pro', object: 'model', owned_by: 'google' },
        { id: 'models/text-embedding-004', object: 'model', owned_by: 'google' },
      ],
    }

    const view = await listProviderModels('gemini', { fetch: fakeFetch(body, seen) })

    expect(view.models).toEqual(['gemini-3-pro'])
    expect(seen[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models')
  })

  it("asks xAI's OpenAI-compatible endpoint", async () => {
    setKey('XAI_API_KEY')
    const seen: Request[] = []

    const view = await listProviderModels('xai', { fetch: fakeFetch({ object: 'list', data: [{ id: 'grok-5', object: 'model', created: 1, owned_by: 'xai' }] }, seen) })

    expect(view.models).toEqual(['grok-5'])
    expect(seen[0].url).toBe('https://api.x.ai/v1/models')
  })

  it("offers Meta's known Muse models when the Model API refuses to list them", async () => {
    setKey('META_API_KEY')
    const seen: Request[] = []

    const view = await listProviderModels('meta', { fetch: fakeFetch({ error: { message: 'Not found' } }, seen, 404) })

    expect(seen[0].url).toBe('https://api.meta.ai/v1/models')
    expect(view).toEqual({ provider: 'meta', models: ['muse-spark-1.3', 'muse-wonder-1.0', 'muse-spark-1.2', 'muse-spark-1.1'] })
  })

  it('caches the list per key', async () => {
    setKey('DEEPSEEK_API_KEY')
    const seen: Request[] = []
    const fetchModels = fakeFetch({ object: 'list', data: [{ id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' }] }, seen)

    await listProviderModels('deepseek', { fetch: fetchModels })
    const again = await listProviderModels('deepseek', { fetch: fetchModels })
    expect(again.models).toEqual(['deepseek-v4-pro'])
    expect(seen).toHaveLength(1)

    setKey('DEEPSEEK_API_KEY')
    await listProviderModels('deepseek', { fetch: fetchModels })
    expect(seen).toHaveLength(2)
  })

  it('explains a missing key instead of calling the provider', async () => {
    const seen: Request[] = []

    const view = await listProviderModels('openai', { fetch: fakeFetch({}, seen) })

    expect(view.models).toEqual([])
    expect(view.error).toContain('OPENAI_API_KEY')
    expect(seen).toHaveLength(0)
  })

  it('offers the common models without a key, saying the key lists them all', async () => {
    const seen: Request[] = []

    const view = await listProviderModels('anthropic', { fetch: fakeFetch({}, seen) })

    expect(view.models).toContain('claude-sonnet-5')
    expect(view.error).toContain('ANTHROPIC_API_KEY')
    expect(seen).toHaveLength(0)
  })

  it('reports a provider error without throwing or showing the key', async () => {
    const key = setKey('OPENAI_API_KEY')

    const view = await listProviderModels('openai', { fetch: fakeFetch({ error: { message: 'Incorrect API key provided' } }, [], 401) })

    expect(view.models).toEqual([])
    expect(view.error).toMatch(/Couldn't list openai's models/)
    expect(JSON.stringify(view)).not.toContain(key)
  })

  it('refuses an unknown provider', async () => {
    await expect(listProviderModels('acme')).rejects.toThrow(ModelKeyError)
  })
})
