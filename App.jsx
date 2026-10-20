import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import Login from './components/Login'
import NewRun from './components/NewRun'
import History from './components/History'
import Machines from './components/Machines'
import ThemeToggle from './components/ThemeToggle'

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
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const [m, d] = await Promise.all([
      supabase.from('machines').select('*').order('created_at'),
      supabase.from('parameter_defs').select('*').order('sort').order('label'),
    ])
    setLoaded(true)
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
  const machineDefs = machine ? defs.filter((d) => d.machine_id === machine.id) : []
  const activePrefill = prefill && machine && prefill.machineId === machine.id ? prefill : null

  function startFrom(run) {
    setPrefill({ machineId: run.machine_id, material: run.material, params: run.params, key: Date.now() })
    setTab('log')
  }

  function openMachineSettings(id) {
    setMachineId(id)
    setTab('machines')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <h1 className="text-xl font-bold">Machine log</h1>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="mr-1 hidden md:inline">{user.email}</span>
          <ThemeToggle />
          <button className="btn-quiet btn-sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-bad p-3 text-bad">
          Couldn’t load machines: {error}. If you’ve just updated the site, check that update-002.sql has been run in Supabase.
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
                {m.machine_type && m.machine_type !== m.name && (
                  <span className={`text-xs font-normal ${on ? 'opacity-70' : 'text-muted'}`}>{m.machine_type}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <nav className="mt-6 flex gap-6 overflow-x-auto border-b border-line" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2 font-bold ${
              tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="mt-6">
        {tab === 'machines' && (
          <Machines machines={machines} defs={defs} selectedId={machineId} onSelect={setMachineId} onChanged={load} />
        )}
        {tab !== 'machines' && loaded && !machine && !error && (
          <p className="text-muted">No machines yet. Add one in “Machines and settings” to get started.</p>
        )}
        {tab === 'log' && machine && (
          <NewRun
            key={`${machine.id}-${activePrefill?.key ?? 0}`}
            machine={machine}
            defs={machineDefs}
            prefill={activePrefill}
            onDefaultsSaved={load}
            onEditSettings={() => openMachineSettings(machine.id)}
          />
        )}
        {tab === 'history' && machine && (
          <History machine={machine} defs={machineDefs} userId={user.id} onStartFrom={startFrom} />
        )}
      </main>
    </div>
  )
}
