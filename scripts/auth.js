// One-time OAuth setup. Usage:
//   BC_CLIENT_ID=... BC_CLIENT_SECRET=... node scripts/auth.js
// Re-running with no args reuses the client ID and secret in the `basecamp` env var.
//
// Listens on the registered redirect URI, swaps the code for tokens, finds the
// Basecamp account, and writes everything to the user env var `basecamp` as JSON.
// Never prints tokens.
const http = require('node:http')
const { spawnSync } = require('node:child_process')
const { PORT, REDIRECT_URI, LAUNCHPAD, USER_AGENT } = require('../src/main/constants')

function existing() {
  try {
    return JSON.parse(process.env.basecamp || '{}')
  } catch {
    return {}
  }
}

const saved = existing()
const clientId = process.env.BC_CLIENT_ID || saved.client_id
const clientSecret = process.env.BC_CLIENT_SECRET || saved.client_secret

if (!clientId || !clientSecret) {
  console.error('Set BC_CLIENT_ID and BC_CLIENT_SECRET.')
  process.exit(1)
}

async function exchange(code) {
  const params = new URLSearchParams({
    type: 'web_server',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    code,
  })
  const res = await fetch(`${LAUNCHPAD}/authorization/token?${params}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status}`)
  return res.json()
}

async function findAccount(accessToken) {
  const res = await fetch(`${LAUNCHPAD}/authorization.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`Authorization lookup failed: HTTP ${res.status}`)
  const { accounts, identity } = await res.json()
  const account = accounts.find((a) => a.product === 'bc3')
  if (!account) throw new Error('No Basecamp account on this login')
  return { accountId: account.id, accountName: account.name, identityId: identity.id }
}

function saveEnv(value) {
  // Passed through the child's environment so the secret never appears in argv.
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', "[Environment]::SetEnvironmentVariable('basecamp', $env:BC_ENV_VALUE, 'User')"],
    { env: { ...process.env, BC_ENV_VALUE: value }, encoding: 'utf8' },
  )
  if (result.status !== 0) throw new Error(`Could not save env var: ${result.stderr}`)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  if (url.pathname !== '/oauth/callback') {
    res.writeHead(404).end()
    return
  }
  const code = url.searchParams.get('code')
  if (!code) {
    res.writeHead(400).end('Authorization was denied.')
    console.error('Denied:', url.searchParams.get('error'))
    process.exit(1)
  }
  try {
    const tokens = await exchange(code)
    const { accountId, accountName, identityId } = await findAccount(tokens.access_token)
    saveEnv(
      JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        account_id: accountId,
      }),
    )
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Authorized. You can close this tab.')
    console.log(`Saved env var "basecamp" for account ${accountId} (${accountName}), identity ${identityId}.`)
    server.close(() => process.exit(0))
  } catch (err) {
    res.writeHead(500).end('Authorization failed. See the terminal.')
    console.error(err.message)
    process.exit(1)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const params = new URLSearchParams({ type: 'web_server', client_id: clientId, redirect_uri: REDIRECT_URI })
  console.log(`Open: ${LAUNCHPAD}/authorization/new?${params}`)
})
