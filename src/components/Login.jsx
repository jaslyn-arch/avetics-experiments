import { useState } from 'react'
import { supabase } from '../supabase'
import ThemeToggle from './ThemeToggle'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp
    const { data, error } = await fn.call(supabase.auth, { email, password })
    setBusy(false)
    if (error) setMessage({ tone: 'text-bad', text: error.message })
    else if (mode === 'signup' && !data.session)
      setMessage({ tone: 'text-ok', text: 'Check your email to confirm your account, then sign in.' })
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <ThemeToggle className="fixed right-5 top-5" />
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-line bg-surface p-6">
        <p className="font-mono text-xs text-muted">experiments /</p>
        <h1 className="text-2xl font-semibold">Machine Log</h1>
        <p className="mt-1 text-muted">Settings that worked, settings that didn’t, and a check before you test.</p>

        <label className="mt-6 block">
          <span className="lbl">Email</span>
          <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mt-4 block">
          <span className="lbl">Password</span>
          <input className="field" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {message && <p className={`mt-4 text-sm ${message.tone}`}>{message.text}</p>}

        <button className="btn-primary mt-6 w-full" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="mt-3 w-full text-sm text-accent underline-offset-2 hover:underline"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null) }}
        >
          {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
