import { useState } from 'react'
import { supabase } from '../supabase'
import { OUTCOMES, blank, differsFromDefault, formatValue, groupDefs } from '../constants'
import { deletePhotoFilesFor, deletePhotos, uploadRunPhotos } from '../lib/photos'
import Modal from './Modal'
import PhotoPicker from './PhotoPicker'

export default function RunDetail({ run, defs, urls, userId, onClose, onChanged, onDeleted, onStartFrom }) {
  const mine = run.created_by === userId
  const [outcome, setOutcome] = useState(run.outcome)
  const [rating, setRating] = useState(run.rating ?? '')
  const [notes, setNotes] = useState(run.notes ?? '')
  const [newPhotos, setNewPhotos] = useState([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(null)
  const [viewing, setViewing] = useState(null)

  const photos = run.run_photos
  const viewIndex = photos.findIndex((p) => p.id === viewing)
  const hasDefaults = defs.some((d) => !blank(d.default_value))
  const knownKeys = new Set(defs.map((d) => d.key))
  const extra = Object.entries(run.params || {}).filter(([k]) => !knownKeys.has(k))
  const resultChanged = outcome !== run.outcome || String(rating) !== String(run.rating ?? '') || notes !== (run.notes ?? '')

  async function saveResult() {
    setBusy('Saving…')
    const { error } = await supabase
      .from('runs')
      .update({ outcome, rating: rating && outcome !== 'planned' ? Number(rating) : null, notes: notes.trim() || null })
      .eq('id', run.id)
    setBusy('')
    setMessage(error ? { tone: 'text-bad', text: error.message } : { tone: 'text-ok', text: 'Saved.' })
    if (!error) onChanged()
  }

  async function uploadNew() {
    setBusy(`Uploading ${newPhotos.length} photo${newPhotos.length === 1 ? '' : 's'}…`)
    const failed = await uploadRunPhotos(run.id, newPhotos.map((p) => p.file))
    newPhotos.forEach((p) => URL.revokeObjectURL(p.preview))
    setNewPhotos([])
    setBusy('')
    setMessage(failed.length ? { tone: 'text-warn', text: `Some photos didn’t upload — ${failed.join('; ')}` } : { tone: 'text-ok', text: 'Photos added.' })
    onChanged()
  }

  async function removePhoto(photo) {
    if (!confirm('Delete this photo?')) return
    try {
      await deletePhotos([photo])
      setViewing(null)
      onChanged()
    } catch (e) {
      setMessage({ tone: 'text-bad', text: e.message })
    }
  }

  async function deleteRun() {
    if (!confirm(`Delete this run${photos.length ? ` and its ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}? This can’t be undone.`)) return
    setBusy('Deleting…')
    try {
      await deletePhotoFilesFor({ runId: run.id })
      const { error } = await supabase.from('runs').delete().eq('id', run.id)
      if (error) throw error
      onDeleted()
    } catch (e) {
      setBusy('')
      setMessage({ tone: 'text-bad', text: e.message })
    }
  }

  const o = OUTCOMES[run.outcome]
  const title = `${run.material} · ${new Date(run.created_at).toLocaleDateString()}`

  if (viewing && viewIndex >= 0) {
    const p = photos[viewIndex]
    return (
      <Modal title={`Photo ${viewIndex + 1} of ${photos.length}`} onClose={() => setViewing(null)} wide>
        {urls[p.id]?.full ? (
          <img src={urls[p.id].full} alt={`Photo ${viewIndex + 1} of ${run.material}`} className="mx-auto max-h-[65vh] rounded-md object-contain" />
        ) : (
          <p className="text-muted">This photo is still loading. Close and reopen in a moment.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button className="btn-quiet btn-sm" disabled={viewIndex === 0} onClick={() => setViewing(photos[viewIndex - 1].id)}>← Previous</button>
            <button className="btn-quiet btn-sm" disabled={viewIndex === photos.length - 1} onClick={() => setViewing(photos[viewIndex + 1].id)}>Next →</button>
          </div>
          <div className="flex gap-2">
            {urls[p.id]?.full && <a className="btn-quiet btn-sm" href={urls[p.id].full} target="_blank" rel="noreferrer">Open full size</a>}
            <button className="btn-danger btn-sm" onClick={() => removePhoto(p)}>Delete photo</button>
            <button className="btn-quiet btn-sm" onClick={() => setViewing(null)}>Back to run</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`tag ${o.color}`}>{o.label}</span>
        {run.rating && <span className="text-muted">Rated {run.rating}/5</span>}
        {run.is_repeat && <span className="text-muted">Deliberate repeat: {run.repeat_reason}</span>}
        {!mine && <span className="text-muted">Logged by a teammate</span>}
      </div>

      {/* Photos */}
      <section className="mt-6">
        <h3 className="font-semibold">Photos</h3>
        <div className="mt-3">
          <PhotoPicker files={newPhotos} onChange={setNewPhotos} disabled={Boolean(busy)}>
            {photos.map((p, i) => (
              <button key={p.id} className="block" onClick={() => setViewing(p.id)} aria-label={`View photo ${i + 1}`}>
                {urls[p.id]?.thumb ? (
                  <img src={urls[p.id].thumb} alt="" className="h-24 w-24 rounded-md border border-line object-cover" />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-md border border-line text-xs text-muted">Loading</span>
                )}
              </button>
            ))}
          </PhotoPicker>
          {newPhotos.length > 0 && (
            <button className="btn-primary btn-sm mt-3" onClick={uploadNew} disabled={Boolean(busy)}>
              Upload {newPhotos.length} new photo{newPhotos.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </section>

      {/* Result */}
      <section className="mt-6">
        <h3 className="font-semibold">Result</h3>
        {mine ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="lbl">Result</span>
                <select className="field" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="lbl">Rating, 1 to 5</span>
                <select className="field" value={rating} onChange={(e) => setRating(e.target.value)} disabled={outcome === 'planned'}>
                  <option value="">No rating</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="lbl">Notes</span>
              <textarea className="field min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button className="btn-primary btn-sm" onClick={saveResult} disabled={!resultChanged || Boolean(busy)}>Save result</button>
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-wrap">{run.notes || <span className="text-muted">No notes.</span>}</p>
        )}
      </section>

      {/* Settings */}
      <section className="mt-6">
        <h3 className="font-semibold">Settings used</h3>
        {groupDefs(defs).map(([name, items]) => {
          const withValues = items.filter((d) => !blank(run.params?.[d.key]))
          if (!withValues.length) return null
          return (
            <div key={name} className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{name}</p>
              <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,14rem)_auto]">
                {withValues.map((d) => {
                  const changed = hasDefaults && differsFromDefault(d, run.params[d.key])
                  return (
                    <div key={d.key} className="contents">
                      <dt className="text-muted">{d.label}</dt>
                      <dd className={changed ? 'font-bold text-accent' : ''}>
                        {formatValue(d, run.params[d.key])}
                        {changed && !blank(d.default_value) && <span className="font-normal text-muted"> (default {d.default_value})</span>}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          )
        })}
        {extra.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Settings since removed from this machine</p>
            <dl className="mt-1 grid grid-cols-[minmax(0,14rem)_auto] gap-x-4 gap-y-1 text-sm">
              {extra.map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{String(v)}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {message && <p role="status" className={`mt-4 text-sm ${message.tone}`}>{message.text}</p>}
      {busy && <p role="status" className="mt-4 text-sm text-muted">{busy}</p>}

      <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
        <button className="btn-quiet btn-sm" onClick={() => onStartFrom(run)}>Start a new run from this</button>
        {mine && <button className="btn-danger btn-sm" onClick={deleteRun} disabled={Boolean(busy)}>Delete run</button>}
      </div>
    </Modal>
  )
}
