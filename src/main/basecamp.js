const { API_BASE, LAUNCHPAD, USER_AGENT, HISTORY_DAYS } = require('./constants')

const TOKEN_MARGIN_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 15 * 1000

class HttpError extends Error {
  constructor(status, detail) {
    super(`Basecamp HTTP ${status}${detail ? `: ${detail}` : ''}`)
    this.status = status
  }
}

function loadConfig(raw = process.env.basecamp) {
  if (!raw) throw new Error('The "basecamp" env var is not set. Run: npm run auth')
  const config = JSON.parse(raw)
  for (const key of ['client_id', 'client_secret', 'refresh_token', 'account_id']) {
    if (!config[key]) throw new Error(`The "basecamp" env var has no ${key}. Run: npm run auth`)
  }
  return config
}

function isoDate(date) {
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10)
}

function toEntry(raw) {
  return {
    id: raw.id,
    recordingId: raw.parent.id,
    title: raw.parent.title,
    url: raw.parent.app_url,
    project: raw.bucket.name,
    date: raw.date,
    hours: Number(raw.hours),
    createdAt: raw.created_at,
  }
}

class Basecamp {
  #config
  #fetch
  #token = null
  #tokenExpiresAt = 0
  #tokenRequest = null
  #personId = null

  constructor(config, fetchImpl = fetch) {
    this.#config = config
    this.#fetch = fetchImpl
  }

  async #refreshToken() {
    const { client_id, client_secret, refresh_token } = this.#config
    const params = new URLSearchParams({ type: 'refresh', refresh_token, client_id, client_secret })
    const res = await this.#fetch(`${LAUNCHPAD}/authorization/token?${params}`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) throw new HttpError(res.status, 'token refresh failed, run: npm run auth')
    const { access_token, expires_in } = await res.json()
    this.#token = access_token
    this.#tokenExpiresAt = Date.now() + expires_in * 1000 - TOKEN_MARGIN_MS
    return access_token
  }

  #accessToken() {
    if (this.#token && Date.now() < this.#tokenExpiresAt) return this.#token
    this.#tokenRequest ??= this.#refreshToken().finally(() => {
      this.#tokenRequest = null
    })
    return this.#tokenRequest
  }

  async #send(method, path, body) {
    return this.#fetch(`${API_BASE}/${this.#config.account_id}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.#accessToken()}`,
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(body && { 'Content-Type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }

  async #request(method, path, body) {
    let res = await this.#send(method, path, body)
    if (res.status === 401) {
      this.#token = null
      res = await this.#send(method, path, body)
    }
    if (!res.ok) throw new HttpError(res.status, (await res.text()).slice(0, 200))
    return res.status === 204 ? null : res.json()
  }

  async #myId() {
    this.#personId ??= (await this.#request('GET', '/my/profile.json')).id
    return this.#personId
  }

  async entries(now = new Date()) {
    const from = new Date(now)
    from.setDate(from.getDate() - HISTORY_DAYS)
    const params = new URLSearchParams({
      person_id: await this.#myId(),
      start_date: isoDate(from),
      end_date: isoDate(now),
    })
    const list = await this.#request('GET', `/reports/timesheet.json?${params}`)
    return list.map(toEntry).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  createEntry({ recordingId, date, minutes }) {
    const hours = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
    return this.#request('POST', `/recordings/${recordingId}/timesheet/entries.json`, { date, hours })
  }

  deleteEntry(id) {
    return this.#request('DELETE', `/timesheet_entries/${id}.json`)
  }
}

module.exports = { Basecamp, HttpError, isoDate, loadConfig }
