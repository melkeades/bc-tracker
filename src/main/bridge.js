const http = require('node:http')
const { APP_BASE, PORT } = require('./constants')

const MAX_BODY = 16 * 1024

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > MAX_BODY) reject(new Error('Body too large'))
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(err)
      }
    })
  })
}

function parseTask({ recordingId, title, url }) {
  const valid =
    Number.isSafeInteger(recordingId) &&
    typeof title === 'string' &&
    title.length > 0 &&
    typeof url === 'string' &&
    url.startsWith(`${APP_BASE}/`)
  if (!valid) throw new Error('Invalid task')
  return { recordingId, title: title.slice(0, 500), url }
}

// Web pages can reach localhost, so three checks keep them out. A custom header
// forces a CORS preflight, which this server never answers. Any Origin must be an
// extension's (the extension's own service worker sends none). Host stops DNS rebinding.
function isAllowed({ headers }) {
  const { host, origin } = headers
  return (
    host === `127.0.0.1:${PORT}` &&
    headers['x-bc-tracker'] === '1' &&
    (!origin || origin.startsWith('chrome-extension://'))
  )
}

function createBridge(tracker) {
  const routes = {
    'GET /state': async () => tracker.state,
    'POST /start': async (req) => tracker.start(parseTask(await readJson(req))),
    'POST /stop': async () => tracker.stop(),
  }

  return http.createServer(async (req, res) => {
    const route = routes[`${req.method} ${req.url}`]
    if (!isAllowed(req)) return res.writeHead(403).end()
    if (!route) return res.writeHead(404).end()
    try {
      const { running, pending } = await route(req)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ running, pending }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
  })
}

module.exports = { createBridge }
