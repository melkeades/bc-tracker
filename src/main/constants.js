const PORT = 47823

module.exports = {
  PORT,
  REDIRECT_URI: `http://127.0.0.1:${PORT}/oauth/callback`,
  LAUNCHPAD: 'https://launchpad.37signals.com',
  API_BASE: 'https://3.basecampapi.com',
  APP_BASE: 'https://app.basecamp.com',
  USER_AGENT: 'BC Tracker (local desktop app)',
  DEFAULT_HOTKEY: 'CommandOrControl+Shift+Alt+B',
  DEFAULT_TIME_ZONE: 'America/Los_Angeles',
  HISTORY_DAYS: 30,
  MIN_LOG_MINUTES: 1,
}
