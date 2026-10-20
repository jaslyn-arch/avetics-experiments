import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { OUTCOMES, formatValue } from '../constants'

export default function History({ machine, defs, userId, onStartFrom }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [material, setMaterial] = useState('')
  const [outcome, setOutcome] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('runs')
      .select('*')
      .eq('machine_id', machine.id)
      .order('created_at', { ascending: false })
      .limit(500)
    setLoading(false)
    if (error) setError(error.message)
    else { setError(''); setRuns(data) }
  }, [machine.id])

  useEffect(() => { load() }, [load])

  const materials = useMemo(() => [...new Set(runs.map((r) => r.material))].sort(), [runs])
  const shown = runs.filter(
    (r) => (!material || r.material === material) && (outcome === 'all' || r.outcome === outcome)
  )

  async function setResult(run, value) {
    const { error } = await supabase.from('runs').update({ outcome: value }).eq('id', run.id)
    if (error) setError(error.message)
    else load()
  }

  async function remove(run) {
    if (!confirm('Delete this run? This can’t be undone.')) return
    const { error } = await supabase.from('runs').delete().eq('id', run.id)
    if (error) setError(error.message)
    else load()
  }

  return (
    <div>
      <div className="flex flex-wrap gap-4">
        <label className="block w-full sm:w-64">
          <span className="lbl">Material</span>
          <select className="field" value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="">All materials</option>
            {materials.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="block w-full sm:w-48">
          <span className="lbl">Result</span>
          <select className="field" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="all">Any result</option>
            {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="mt-4 text-bad">{error}</p>}
      {!loading && shown.length === 0 && (
        <p className="mt-8 text-muted">
          {runs.length === 0 ? `No runs logged for ${machine.name} yet. Log your first one to start building a record.` : 'No runs match these filters.'}
        </p>
      )}

      {shown.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="p-3 font-normal">Date</th>
                <th className="p-3 font-normal">Material</th>
                <th className="p-3 font-normal">Settings</th>
                <th className="p-3 font-normal">Result</th>
                <th className="p-3 font-normal">Notes</th>
                <th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const mine = r.created_by === userId
                const o = OUTCOMES[r.outcome]
                return (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="whitespace-nowrap p-3">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3 font-bold">{r.material}</td>
                    <td className="p-3">
                      <ul className="space-y-0.5">
                        {defs.filter((d) => r.params?.[d.key] !== undefined).map((d) => (
                          <li key={d.key}><span className="text-muted">{d.label}</span> {formatValue(d, r.params[d.key])}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3">
                      {mine ? (
                        <select
                          aria-label="Result"
                          className={`rounded border bg-surface px-2 py-1 font-bold ${o.color}`}
                          value={r.outcome}
                          onChange={(e) => setResult(r, e.target.value)}
                        >
                          {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ) : (
                        <span className={`rounded border px-2 py-0.5 font-bold ${o.color}`}>{o.label}</span>
                      )}
                      {r.rating && <div className="mt-1 text-muted">Rated {r.rating}/5</div>}
                      {r.is_repeat && <div className="mt-1 text-muted">Repeat: {r.repeat_reason}</div>}
                    </td>
                    <td className="max-w-xs p-3">{r.notes}</td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <button className="text-accent hover:underline" onClick={() => onStartFrom(r)}>Start from this</button>
                      {mine && (
                        <button className="ml-4 text-muted hover:text-bad" onClick={() => remove(r)}>Delete</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
