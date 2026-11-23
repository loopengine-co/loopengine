import { describe, it, expect, afterEach } from 'vitest'
import { createServer, request, type Server, type IncomingHttpHeaders } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { compressResponses, serveConsoleAsset } from '#web/response-compression.js'

const code = 'var shell = 1;' + ' '.repeat(3000)
const page = '<!doctype html><title>x</title><style>body{}</style><script>' + code + '</script>' + 'console '.repeat(400)
let server: Server | undefined
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())))

function serve(): Promise<number> {
  server = createServer((req, res) => {
    compressResponses(req, res)
    if (serveConsoleAsset(req, res)) return
    if (req.url === '/page') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page)
    if (req.url === '/private') return void res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(page)
    if (req.url === '/json') { res.setHeader('content-type', 'application/json'); return void res.end(JSON.stringify({ items: 'x'.repeat(2000) })) }
    if (req.url === '/small') return void res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
    if (req.url === '/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: one\n\n')
      return void res.end('data: two\n\n')
    }
    res.writeHead(404).end()
  })
  return new Promise((done) => server!.listen(0, () => done((server!.address() as { port: number }).port)))
}

function get(port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
  return new Promise((done, fail) => {
    request({ port, path, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => done({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }))
    }).on('error', fail).end()
  })
}

describe('compressResponses', () => {
  it('gzips a page, tags it, and answers an unchanged one with 304', async () => {
    const port = await serve()
    const first = await get(port, '/page', { 'accept-encoding': 'gzip, br' })
    expect(first.status).toBe(200)
    expect(first.headers['content-encoding']).toBe('gzip')
    expect(first.headers['cache-control']).toBe('no-cache')
    expect(first.headers.vary).toMatch(/Accept-Encoding/)
    expect(gunzipSync(first.body).toString()).not.toContain(code)
    expect(first.body.length).toBeLessThan(page.length / 4)

    const again = await get(port, '/page', { 'accept-encoding': 'gzip', 'if-none-match': String(first.headers.etag) })
    expect(again.status).toBe(304)
    expect(again.body.length).toBe(0)
  })

  it('sends plain bytes to a client without gzip, and leaves no-store pages untagged', async () => {
    const port = await serve()
    const plain = await get(port, '/page')
    expect(plain.headers['content-encoding']).toBeUndefined()
    const src = /<script src="([^"]+)"><\/script>/.exec(plain.body.toString())![1]
    expect(plain.body.toString()).toContain('<style>body{}</style>')
    expect(plain.body.toString()).toBe(page.replace('<script>' + code + '</script>', `<script src="${src}"></script>`))
    const asset = await get(port, src)
    expect(asset.headers['content-type']).toMatch(/javascript/)
    expect(asset.headers['cache-control']).toMatch(/immutable/)
    expect(asset.body.toString()).toBe(code)
    expect((await get(port, '/_le/assets/nope.js')).status).toBe(404)
    const priv = await get(port, '/private', { 'accept-encoding': 'gzip' })
    expect(priv.headers.etag).toBeUndefined()
    expect(priv.headers['cache-control']).toBe('no-store')
    // A no-store page is sent as it is, code and all.
    expect(gunzipSync(priv.body).toString()).toBe(page)
  })

  it('gzips JSON set with setHeader, and leaves small answers and streams alone', async () => {
    const port = await serve()
    const json = await get(port, '/json', { 'accept-encoding': 'gzip' })
    expect(json.headers['content-encoding']).toBe('gzip')
    expect(JSON.parse(gunzipSync(json.body).toString()).items).toHaveLength(2000)
    const small = await get(port, '/small', { 'accept-encoding': 'gzip' })
    expect(small.headers['content-encoding']).toBeUndefined()
    expect(small.body.toString()).toBe('{"ok":true}')
    const stream = await get(port, '/stream', { 'accept-encoding': 'gzip' })
    expect(stream.headers['content-encoding']).toBeUndefined()
    expect(stream.body.toString()).toBe('data: one\n\ndata: two\n\n')
  })
})
