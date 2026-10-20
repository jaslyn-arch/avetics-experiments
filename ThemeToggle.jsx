import { useState } from 'react'

function currentlyDark() {
  const set = document.documentElement.dataset.theme
  if (set) return set === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default function ThemeToggle({ className = '' }) {
  const [dark, setDark] = useState(currentlyDark)

  function toggle() {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch { /* private mode */ }
    setDark(!dark)
  }

  return (
    <button className={`btn-quiet btn-sm ${className}`} onClick={toggle} aria-pressed={dark}>
      <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
