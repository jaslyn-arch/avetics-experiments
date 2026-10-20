import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { OUTCOMES, blank, differsFromDefault, formatValue } from '../constants'
import { signPhotos } from '../lib/photos'
import RunDetail from './RunDetail'

const MAX_SUMMARY = 5

export default function History({ machine, defs, userId, onStartFrom }) {
  const [runs, setRuns] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [material, setMaterial] = useState('')
  const [outcome, setOutcome] = useState('all')
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('runs')
      .select('*, run_photos(id, path, thumb_path, created_at)')
      .eq('machine_id', machine.id)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }
    for (const r of data) r.run_photos.sort((a, b) => a.created_at.localeCompare(b.created_at))
    setRuns(data)
    setError('')
    try {
      setUrls(await signPhotos(data.flatMap((r) => r.run_photos)))
    } catch (e) {
      setError(`Photos couldn’t be loaded: ${e.message}`)
    }
    setLoading(false)
  }, [machine.id])

  useEffect(() => { load() }, [load])

  const materials = useMemo(() => [...new Set(runs.map((r) => r.material))].sort(), [runs])
  const shown = runs.filter((r) => (!material || r.material === material) && (outcome === 'all' || r.outcome === outcome))
  const hasDefaults = defs.some((d) => !blank(d.default_value))
  const openRun = runs.find((r) => r.id === openId)

  function summary(run) {
    const items = hasDefaults
      ? defs.filter((d) => differsFromDefault(d, run.params?.[d.key]))
      : defs.filter((d) => !blank(run.params?.[d.key]))
    return { items: items.slice(0, MAX_SUMMARY), more: Math.max(0, items.length - MAX_SUMMARY), total: items.length }
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
      {loading && runs.length === 0 && <p className="mt-8 text-muted">Loading runs…</p>}
      {!loading && shown.length === 0 && (
        <p className="mt-8 text-muted">
          {runs.length === 0 ? `No runs logged for ${machine.name} yet.` : 'No runs match these filters.'}
        </p>
      )}

      {shown.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="p-3 font-normal">Date</th>
                <th className="p-3 font-normal">Material</th>
                <th className="p-3 font-normal">{hasDefaults ? 'Changed from defaults' : 'Settings'}</th>
                <th className="p-3 font-normal">Result</th>
                <th className="p-3 font-normal">Photos</th>
                <th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const o = OUTCOMES[r.outcome]
                const s = summary(r)
                const photos = r.run_photos
                return (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="whitespace-nowrap p-3">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className="font-bold">{r.material}</span>
                      {r.notes && <p className="mt-1 line-clamp-2 max-w-[14rem] text-muted">{r.notes}</p>}
                    </td>
                    <td className="p-3">
                      {s.total === 0 ? (
                        <span className="text-muted">{hasDefaults ? 'Same as defaults' : 'No settings recorded'}</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {s.items.map((d) => (
                            <li key={d.key}><span className="text-muted">{d.label}</span> {formatValue(d, r.params[d.key])}</li>
                          ))}
                          {s.more > 0 && <li className="text-muted">+{s.more} more</li>}
                        </ul>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`badge ${o.color}`}>{o.label}</span>
                      {r.rating && <div className="mt-1 text-muted">Rated {r.rating}/5</div>}
                    </td>
                    <td className="p-3">
                      {photos.length > 0 && (
                        <button onClick={() => setOpenId(r.id)} className="flex items-center gap-1" aria-label={`View ${photos.length} photos`}>
                          {photos.slice(0, 3).map((p) =>
                            urls[p.id]?.thumb ? (
                              <img key={p.id} src={urls[p.id].thumb} alt="" className="h-12 w-12 rounded border border-line object-cover" />
                            ) : null
                          )}
                          {photos.length > 3 && <span className="ml-1 text-muted">+{photos.length - 3}</span>}
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <button className="btn-quiet btn-sm" onClick={() => setOpenId(r.id)}>
                        {r.outcome === 'planned' && r.created_by === userId ? 'Add result' : 'Open'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {openRun && (
        <RunDetail
          run={openRun}
          defs={defs}
          urls={urls}
          userId={userId}
          onClose={() => setOpenId(null)}
          onChanged={load}
          onDeleted={() => { setOpenId(null); load() }}
          onStartFrom={(r) => { setOpenId(null); onStartFrom(r) }}
        />
      )}
    </div>
  )
}
