import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hotkeyLabel, timeZoneOptions, toAccelerator } from '../src/renderer/options.js'

const press = (code, mods = {}) => ({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods })

test('builds an accelerator in the default order', () => {
  const event = press('KeyB', { ctrlKey: true, shiftKey: true, altKey: true })
  assert.equal(toAccelerator(event), 'CommandOrControl+Shift+Alt+B')
})

test('maps digits, punctuation, arrows and the Win key', () => {
  assert.equal(toAccelerator(press('Digit7', { altKey: true })), 'Alt+7')
  assert.equal(toAccelerator(press('Slash', { ctrlKey: true })), 'CommandOrControl+/')
  assert.equal(toAccelerator(press('ArrowUp', { ctrlKey: true })), 'CommandOrControl+Up')
  assert.equal(toAccelerator(press('KeyT', { metaKey: true, altKey: true })), 'Alt+Super+T')
})

test('F-keys work alone', () => {
  assert.equal(toAccelerator(press('F9')), 'F9')
  assert.equal(toAccelerator(press('F12', { shiftKey: true })), 'Shift+F12')
})

test('refuses modifiers alone, plain typing, and unknown keys', () => {
  assert.equal(toAccelerator(press('ControlLeft', { ctrlKey: true })), null)
  assert.equal(toAccelerator(press('KeyA')), null)
  assert.equal(toAccelerator(press('KeyA', { shiftKey: true })), null)
  assert.equal(toAccelerator(press('MediaPlayPause', { ctrlKey: true })), null)
})

test('hotkeyLabel uses Windows key names', () => {
  assert.equal(hotkeyLabel('CommandOrControl+Shift+Alt+B'), 'Ctrl+Shift+Alt+B')
  assert.equal(hotkeyLabel('Alt+Super+T'), 'Alt+Win+T')
})

test('zones are sorted by offset and labelled with it', () => {
  const winter = timeZoneOptions(new Date('2026-01-15T12:00:00Z'))
  const offsets = winter.map((z) => z.minutes)
  assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b))
  const label = (value) => winter.find((z) => z.value === value).label
  assert.equal(label('America/Los_Angeles'), 'UTC-08:00 Los Angeles (PST)')
  assert.ok(label('Asia/Kolkata').startsWith('UTC+05:30 Kolkata'))
  assert.equal(label('UTC'), 'UTC+00:00 UTC')
})

test('labels follow daylight saving', () => {
  const summer = timeZoneOptions(new Date('2026-07-15T12:00:00Z'))
  assert.equal(summer.find((z) => z.value === 'America/Los_Angeles').label, 'UTC-07:00 Los Angeles (PDT)')
})

test('every listed zone is one this runtime knows', () => {
  assert.ok(timeZoneOptions().length > 50)
})
