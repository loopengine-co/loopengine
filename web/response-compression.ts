// Smaller, cacheable console responses. The console's pages are large
// strings built once at start (agents-config-page.ts alone is ~400 KB),
// sent whole on every click; through a hosted router each byte and each
// round trip counts. compressResponses(req, res) wraps one response:
//
// - a body sent in one res.end() (pages and JSON answers) is gzipped
//   when the client accepts it and it's worth it;
// - a GET page (text/html, 200) gets an ETag and "no-cache", so the
//   browser keeps it and asks again with If-None-Match: an unchanged
//   page is a 304 with no body. A response that says no-store keeps it.
//
// - such a page's large inline <script> and <style> blocks (nearly all
//   of its bytes) move to /_le/assets/<hash>.js|.css, which the browser
//   keeps for good: a click then fetches only the page's few KB of
//   markup, and the code shared by every page (the sidebar, the styles)
//   comes from cache. serveConsoleAsset answers those requests.
//
// Anything written in pieces (res.write: event streams, piped files) goes
// out untouched, as does a response that already has a content-encoding.
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const MIN_BYTES = 1024
const COMPRESSIBLE = /^(text\/|application\/(json|javascript)|image\/svg\+xml)/i

// The pages are the same few strings sent again and again: their
// gzipped copies are kept, by content hash.
const gzipped = new Map<string, Buffer>()
const MAX_CACHED = 64

function gzipOf(body: Buffer, hash: string): Buffer {
  const hit = gzipped.get(hash)
  if (hit) return hit
  const out = gzipSync(body, { level: 6 })
  if (gzipped.size >= MAX_CACHED) gzipped.delete(gzipped.keys().next().value as string)
  gzipped.set(hash, out)
  return out
}

// Page code moved out of the pages, by content hash. The pages are
// strings fixed at start, so this holds a few dozen blocks; the cap only
// guards against a page that changes on every request.
const ASSET_MIN_BYTES = 2048
const MAX_ASSETS = 512
const assets = new Map<string, { type: string; body: Buffer }>()
const leanPages = new Map<string, string>()

function keepAsset(text: string, ext: 'js' | 'css'): string {
  const body = Buffer.from(text, 'utf8')
  const name = createHash('sha1').update(body).digest('base64url').slice(0, 20) + '.' + ext
  if (!assets.has(name)) {
    if (assets.size >= MAX_ASSETS) assets.delete(assets.keys().next().value as string)
    assets.set(name, { type: ext === 'js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', body })
  }
  return '/_le/assets/' + name
}

// A page with its large plain <script> and <style> blocks as files. They
// run in the same order and block the page the same way they did inline.
function leanPage(html: string, hash: string): string {
  const hit = leanPages.get(hash)
  if (hit !== undefined) return hit
  const out = html
    .replace(/<script>([\s\S]*?)<\/script>/g, (whole, code: string) => (code.length >= ASSET_MIN_BYTES ? `<script src="${keepAsset(code, 'js')}"></script>` : whole))
    .replace(/<style>([\s\S]*?)<\/style>/g, (whole, css: string) => (css.length >= ASSET_MIN_BYTES ? `<link rel="stylesheet" href="${keepAsset(css, 'css')}">` : whole))
  if (leanPages.size >= MAX_CACHED) leanPages.delete(leanPages.keys().next().value as string)
  leanPages.set(hash, out)
  return out
}

/** Answers GET /_le/assets/<name> from the pages' moved-out code; false
 * for any other request. An asset's name is its content hash, so it's
 * cached for good. */
export function serveConsoleAsset(req: IncomingMessage, res: ServerResponse): boolean {
  const path = (req.url ?? '').split('?')[0]
  if (!path.startsWith('/_le/assets/') || (req.method !== 'GET' && req.method !== 'HEAD')) return false
  const asset = assets.get(path.slice('/_le/assets/'.length))
  if (!asset) {
    res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('Not found')
    return true
  }
  res.writeHead(200, { 'content-type': asset.type, 'cache-control': 'public, max-age=31536000, immutable' })
  res.end(req.method === 'HEAD' ? undefined : asset.body)
  return true
}

function headerValue(headers: OutgoingHttpHeaders, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name)
  const v = key ? headers[key] : undefined
  return v === undefined ? undefined : Array.isArray(v) ? v.join(', ') : String(v)
}

function dropHeader(headers: OutgoingHttpHeaders, name: string): void {
  for (const k of Object.keys(headers)) if (k.toLowerCase() === name) delete headers[k]
}

export function compressResponses(req: IncomingMessage, res: ServerResponse): void {
  const acceptsGzip = /\bgzip\b/i.test(String(req.headers['accept-encoding'] ?? ''))
  const isGet = req.method === 'GET'
  if (!acceptsGzip && !isGet) return

  const writeHead = res.writeHead.bind(res) as (status: number, ...rest: unknown[]) => ServerResponse
  const write = res.write.bind(res) as (...args: unknown[]) => boolean
  const end = res.end.bind(res) as (...args: unknown[]) => ServerResponse
  // writeHead is held back until the body is known; a write sends it as given.
  let held: { status: number; message?: string; headers: OutgoingHttpHeaders } | undefined
  let streaming = false

  const release = (): void => {
    if (!held) return
    const h = held
    held = undefined
    if (h.message !== undefined) writeHead(h.status, h.message, h.headers)
    else writeHead(h.status, h.headers)
  }

  res.writeHead = function (status: number, ...rest: unknown[]): ServerResponse {
    const message = typeof rest[0] === 'string' ? (rest.shift() as string) : undefined
    const given = rest[0]
    const headers: OutgoingHttpHeaders = {}
    if (Array.isArray(given)) {
      for (let i = 0; i + 1 < given.length; i += 2) headers[String(given[i])] = given[i + 1] as string
    } else if (given && typeof given === 'object') Object.assign(headers, given)
    held = { status, ...(message !== undefined ? { message } : {}), headers }
    // An event stream's head goes out at once, before its first event.
    if (/^text\/event-stream/i.test(headerValue(headers, 'content-type') ?? '')) {
      streaming = true
      release()
    }
    return res
  } as ServerResponse['writeHead']

  res.write = function (...args: unknown[]): boolean {
    streaming = true
    release()
    return write(...args)
  } as ServerResponse['write']

  res.end = function (...args: unknown[]): ServerResponse {
    const chunk = args[0]
    if (streaming || (chunk !== undefined && chunk !== null && typeof chunk !== 'string' && !Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array))) {
      release()
      return end(...args)
    }
    const encoding = typeof args[1] === 'string' ? (args[1] as BufferEncoding) : 'utf8'
    const callback = args.find((a) => typeof a === 'function') as (() => void) | undefined
    const status = held?.status ?? res.statusCode
    // Headers set with setHeader, overlaid by writeHead's own.
    const headers: OutgoingHttpHeaders = { ...res.getHeaders(), ...(held?.headers ?? {}) }
    for (const name of res.getHeaderNames()) res.removeHeader(name)
    const message = held?.message
    held = undefined
    const body = chunk === undefined || chunk === null ? Buffer.alloc(0) : typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk as Uint8Array)
    const type = headerValue(headers, 'content-type') ?? ''
    const cacheControl = headerValue(headers, 'cache-control') ?? ''
    const already = headerValue(headers, 'content-encoding')
    const hash = body.length ? createHash('sha1').update(body).digest('base64url').slice(0, 27) : ''

    let out: Buffer = body
    if (isGet && status === 200 && /^text\/html/i.test(type) && !/no-store/i.test(cacheControl) && !headerValue(headers, 'etag') && body.length) {
      out = Buffer.from(leanPage(body.toString('utf8'), hash), 'utf8')
      const etag = `W/"${hash}"`
      headers.etag = etag
      dropHeader(headers, 'cache-control')
      headers['cache-control'] = 'no-cache'
      dropHeader(headers, 'vary')
      headers.vary = 'Accept, Accept-Encoding'
      const asked = String(req.headers['if-none-match'] ?? '')
      if (asked.split(',').some((t) => t.trim() === etag)) {
        dropHeader(headers, 'content-type')
        dropHeader(headers, 'content-length')
        if (message !== undefined) writeHead(304, message, headers)
        else writeHead(304, headers)
        return end(callback)
      }
    }
    if (acceptsGzip && !already && body.length >= MIN_BYTES && COMPRESSIBLE.test(type) && req.method !== 'HEAD' && status !== 204 && status !== 304) {
      out = gzipOf(out, out === body ? hash : hash + ':lean')
      headers['content-encoding'] = 'gzip'
      const vary = headerValue(headers, 'vary')
      if (!vary || !/accept-encoding/i.test(vary)) {
        dropHeader(headers, 'vary')
        headers.vary = vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding'
      }
      dropHeader(headers, 'content-length')
      headers['content-length'] = String(out.length)
    }
    if (message !== undefined) writeHead(status, message, headers)
    else writeHead(status, headers)
    return end(out, callback)
  } as ServerResponse['end']
}
