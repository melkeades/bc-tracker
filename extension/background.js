// All localhost traffic goes through here: a service worker with host permissions
// is exempt from the browser's block on web pages reaching local addresses.
const APP = 'http://127.0.0.1:47823'

async function callApp({ path, task }) {
  const res = await fetch(`${APP}${path}`, {
    method: path === '/state' ? 'GET' : 'POST',
    headers: { 'X-BC-Tracker': '1', ...(task && { 'Content-Type': 'application/json' }) },
    body: task ? JSON.stringify(task) : undefined,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  callApp(message).then(reply, () => reply({ offline: true }))
  return true
})
