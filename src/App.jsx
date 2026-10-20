import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { TYPE_LABELS } from './constants'
import Login from './components/Login'
import NewRun from './components/NewRun'
import History from './components/History'
import Machines from './components/Machines'
import Assistant from './components/Assistant'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  if (!session) return <Login />
  return <Workspace user={session.user} />
}

const TABS = [
  { id: 'log', label: 'Log a run' },
  { id: 'history', label: 'History' },
  { id: 'machines', label: 'Machines and settings' },
]

function Workspace({ user }) {
  const [machines, setMachines] = useState([])
  const [defs, setDefs] = useState([])
  const [machineId, setMachineId] = useState(null)
  const [tab, setTab] = useState('log')
  const [prefill, setPrefill] = useState(null)
  const [error, setError] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [draft, setDraft] = useState(null)

  const load = useCallback(async () => {
    const [m, d] = await Promise.all([
      supabase.from('machines').select('*').order('created_at'),
      supabase.from('parameter_defs').select('*').order('sort'),
    ])
    if (m.error || d.error) {
      setError((m.error || d.error).message)
      return
    }
    setError('')
    setMachines(m.data)
    setDefs(d.data)
    setMachineId((id) => (id && m.data.some((x) => x.id === id) ? id : m.data[0]?.id ?? null))
  }, [])

  useEffect(() => { load() }, [load])

  const machine = machines.find((m) => m.id === machineId)
  const machineDefs = machine ? defs.filter((d) => d.machine_type === machine.machine_type) : []

  function startFrom(run) {
    setPrefill({ material: run.material, params: run.params, key: Date.now() })
    setTab('log')
  }

  return (
    <>
    <div className={`mx-auto max-w-6xl px-4 pb-16 sm:px-6 ${askOpen ? 'xl:mr-[28rem]' : ''}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <h1 className="text-xl font-bold">Machine log</h1>
        <div className="flex items-center gap-3 text-sm text-muted">
          <button className="btn-primary py-1 text-sm" onClick={() => setAskOpen((o) => !o)} aria-expanded={askOpen}>
            {askOpen ? 'Close' : 'Ask Claude or ChatGPT'}
          </button>
          <span className="hidden sm:inline">{user.email}</span>
          <button className="btn-quiet py-1 text-sm" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-bad p-3 text-bad">
          Couldn’t load machines: {error}. Check that schema.sql has been run in Supabase.
        </p>
      )}

      {tab !== 'machines' && machines.length > 0 && (
        <div role="radiogroup" aria-label="Machine" className="mt-6 flex flex-wrap gap-2">
          {machines.map((m) => {
            const on = m.id === machineId
            return (
              <button
                key={m.id}
                role="radio"
                aria-checked={on}
                onClick={() => setMachineId(m.id)}
                className={`btn border ${on ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink'}`}
              >
                {m.name}
                {m.name !== TYPE_LABELS[m.machine_type] && (
                  <span className={`ml-2 text-xs font-normal ${on ? 'opacity-70' : 'text-muted'}`}>
                    {TYPE_LABELS[m.machine_type]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <nav className="mt-6 flex gap-6 border-b border-line" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px border-b-2 pb-2 font-bold ${
              tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="mt-6">
        {tab === 'machines' && <Machines machines={machines} defs={defs} onChanged={load} />}
        {tab !== 'machines' && !machine && !error && (
          <p className="text-muted">Add a machine in “Machines and settings” to get started.</p>
        )}
        {tab === 'log' && machine && (
          <NewRun
            key={`${machine.id}-${prefill?.key ?? 0}`}
            machine={machine}
            defs={machineDefs}
            prefill={prefill?.key ? prefill : null}
            onDraftChange={setDraft}
          />
        )}
        {tab === 'history' && machine && (
          <History machine={machine} defs={machineDefs} userId={user.id} onStartFrom={startFrom} />
        )}
      </main>
    </div>
    <Assistant
      open={askOpen}
      onClose={() => setAskOpen(false)}
      machines={machines}
      defs={defs}
      machine={machine}
      draft={tab === 'log' ? draft : null}
    />
    </>
  )
}
