const dialog = document.getElementById('confirm')
const text = document.getElementById('confirm-text')

// Resolves true only for the confirm button. Cancel and Esc both resolve false.
export function confirmAction(message) {
  text.textContent = message
  dialog.returnValue = ''
  dialog.showModal()
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true })
  })
}
