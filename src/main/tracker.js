const { EventEmitter } = require('node:events')
const { HttpError, isoDate } = require('./basecamp')
const { MIN_LOG_MINUTES } = require('./constants')

const MINUTE_MS = 60000

// Basecamp stores finished hours only, so the running timer lives here.
// A stopped session goes into `pending` on disk before any network call, which
// means the app can quit or lose its connection without losing tracked time.
class Tracker extends EventEmitter {
  #api
  #store
  #now
  #state
  #flushing = Promise.resolve()
  error = null

  constructor({ api, store, now = Date.now }) {
    super()
    this.#api = api
    this.#store = store
    this.#now = now
    this.#state = { running: null, last: null, pending: [], ...store.load() }
  }

  get state() {
    const { running, last, pending } = this.#state
    return { running, last, pending: pending.length, error: this.error }
  }

  #commit() {
    this.#store.save(this.#state)
    this.emit('change', this.state)
  }

  #closeSession() {
    const { running } = this.#state
    if (!running) return
    this.#state.running = null
    const elapsed = this.#now() - running.startedAt
    if (elapsed < MIN_LOG_MINUTES * MINUTE_MS) return
    this.#state.pending.push({
      recordingId: running.recordingId,
      title: running.title,
      date: isoDate(new Date(running.startedAt)),
      minutes: Math.round(elapsed / MINUTE_MS),
    })
  }

  // Starting always wins: whatever was running is closed and logged first.
  start({ recordingId, title, url }) {
    if (this.#state.running?.recordingId === recordingId) return this.state
    this.#closeSession()
    const task = { recordingId, title, url }
    this.#state.running = { ...task, startedAt: this.#now() }
    this.#state.last = task
    this.#commit()
    this.flush()
    return this.state
  }

  // The session closes synchronously, so a caller that can't await (Windows
  // ending the session) has still saved it by the time this returns.
  async stop() {
    this.#closeSession()
    this.#commit()
    await this.flush()
    return this.state
  }

  // With no task remembered yet, fallback is the newest Basecamp entry.
  async toggle(fallback) {
    if (this.#state.running) return this.stop()
    const task = this.#state.last ?? fallback
    if (task) return this.start(task)
    throw new Error('No previous task to resume')
  }

  flush() {
    this.#flushing = this.#flushing.then(() => this.#drain())
    return this.#flushing
  }

  async #drain() {
    const { pending } = this.#state
    while (pending.length) {
      const [next] = pending
      try {
        await this.#api.createEntry(next)
        this.error = null
      } catch (err) {
        if (!(err instanceof HttpError) || err.status >= 500 || err.status === 429) {
          this.error = `Couldn't reach Basecamp, will retry: ${err.message}`
          this.emit('change', this.state)
          return
        }
        // Basecamp refused this entry (task deleted, say). Retrying can't help.
        this.error = `Dropped ${next.minutes} min on "${next.title}": ${err.message}`
      }
      pending.shift()
      this.#commit()
      this.emit('logged', next)
    }
  }
}

module.exports = { Tracker }
