# BC Tracker

A time tracker for Basecamp: a Windows tray app, plus a browser extension that adds a
start/stop button to every Basecamp task, between the hours pill and Bookmark.

## How it works

Basecamp has no running timers. A timesheet entry is only a date and a number of hours, so
the timer lives in the desktop app and the entry is written when you stop.

```
Extension button ──┐
Tray / hotkey ─────┼──> Tracker (src/main/tracker.js) ──> Basecamp timesheet API
App window ────────┘    timer + queue saved to disk
```

- Starting a task stops and logs whatever was running.
- Time is logged to the nearest minute. Sessions under a minute are discarded.
- Entries go on the date the session started, in the time zone chosen in settings.
- Stopped sessions are saved before any network call. If Basecamp is unreachable they stay
  queued and retry every minute.
- Quitting the app or shutting down Windows stops the timer. After a crash it keeps running.

## Setup

1. Credentials live in the user env var `basecamp` as JSON. To redo them, close the app and run:

   ```bash
   npm run auth
   ```

   Then open the URL it prints. First-time setup also needs `BC_CLIENT_ID` and
   `BC_CLIENT_SECRET` from your integration at https://launchpad.37signals.com/integrations.

2. Build the app, then run `dist/BC-Tracker-1.0.0.exe`. It enables Start with Windows on first
   launch. You can turn that off from the tray menu.

   ```bash
   npm install
   npm run dist
   ```

3. Load the extension. In Edge go to `edge://extensions` (Chrome: `chrome://extensions`),
   turn on Developer mode, choose **Load unpacked**, and pick the `extension` folder.

## Using it

- **Basecamp button:** Start, a live clock while running (click to stop), or Switch when
  another task is running. It's greyed out if the app isn't running.
- **Hotkey:** `Ctrl+Shift+Alt+B` by default. It stops the timer, or resumes the last task.
- **Settings (gear icon):** Start with Windows, the shortcut, and the time zone, which defaults
  to Los Angeles.
- **App window:** search, unique-per-day filter, click a row to copy its link, ▶ to track a
  task again, ✕ twice to delete. Deleting is permanent in Basecamp.
- Closing the window keeps the app in the tray. Quit from the tray menu.

## Development

```bash
npm test
npm start
```

The extension talks to the app on `127.0.0.1:47823`. See `src/main/bridge.js` for how that
port is kept private from web pages.
