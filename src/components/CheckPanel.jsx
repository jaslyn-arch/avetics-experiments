import { OUTCOMES, formatValue, sameValue } from '../constants'

// The pre-flight check shown beside the form. Its colour tells you,
// at a glance, whether this experiment is worth running.
function verdict(check, allFilled) {
  const ms = check.matches
  const exact = allFilled ? ms.filter((m) => m.match_type === 'exact') : []
  if (exact.some((m) => m.outcome === 'fail'))
    return { tone: 'bad', title: 'This exact setup already failed', body: 'Change at least one setting before testing again.' }
  if (exact.length)
    return { tone: 'warn', title: 'You’ve already run this exact setup', body: 'Use the earlier result, or mark this as a deliberate repeat.' }
  if (ms.some((m) => m.outcome === 'fail'))
    return { tone: 'bad', title: 'A very similar setup failed', body: 'Your settings are within tolerance of a failed run.' }
  if (ms.some((m) => m.outcome === 'planned'))
    return { tone: 'plan', title: 'A similar run is already planned', body: 'Check with whoever planned it before doubling up.' }
  return { tone: 'warn', title: 'Similar runs are on record', body: 'Look at what they found before you test.' }
}

const TONE = {
  ok: 'border-ok',
  warn: 'border-warn',
  bad: 'border-bad',
  plan: 'border-plan',
  idle: 'border-line',
}
const TITLE_TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', plan: 'text-plan', idle: 'text-ink' }

export default function CheckPanel({ check, material, defs, current, filled, allFilled }) {
  let tone = 'idle'
  let title = 'Check before you run'
  let body = 'Enter a material and your settings. Earlier runs that match will show up here so you don’t repeat a test you’ve already done.'

  if (check.state === 'loading') {
    title = 'Checking earlier runs…'
    body = ''
  } else if (check.state === 'error') {
    tone = 'bad'
    title = 'The check couldn’t run'
    body = check.error
  } else if (check.state === 'done' && check.matches.length === 0) {
    tone = 'ok'
    title = 'No earlier run like this'
    body = allFilled
      ? `Nothing on record for ${material.trim()} within your tolerances. This is a new experiment.`
      : `Nothing on record for ${material.trim()} matching the ${filled} setting${filled === 1 ? '' : 's'} filled in so far.`
  } else if (check.state === 'done') {
    ;({ tone, title, body } = verdict(check, allFilled))
  }

  const remaining = defs.length - filled

  return (
    <aside aria-live="polite" className="lg:sticky lg:top-6 lg:self-start">
      <div className={`rounded-lg border border-l-[6px] bg-surface p-5 ${TONE[tone]}`}>
        <h2 className={`text-lg font-bold ${TITLE_TONE[tone]}`}>{title}</h2>
        {body && <p className="mt-1 text-muted">{body}</p>}

        {check.state === 'done' && material.trim() && remaining > 0 && (
          <p className="mt-3 text-sm text-muted">
            {remaining} setting{remaining === 1 ? '' : 's'} still blank, so the check is ignoring {remaining === 1 ? 'it' : 'them'}.
          </p>
        )}

        {check.matches.length > 0 && (
          <ul className="mt-4 space-y-3">
            {check.matches.map((m) => {
              const o = OUTCOMES[m.outcome]
              const diffs = defs.filter((d) => current[d.key] !== undefined && !sameValue(d, m.params?.[d.key], current[d.key]))
              return (
                <li key={m.run_id} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded border px-2 py-0.5 font-bold ${o.color}`}>{o.label}</span>
                    {allFilled && m.match_type === 'exact' && <span className="font-bold">Identical</span>}
                    {m.rating && <span className="text-muted">Rated {m.rating}/5</span>}
                    <span className="ml-auto text-muted">{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                  {diffs.length > 0 && (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                      {diffs.map((d) => (
                        <div key={d.key} className="contents">
                          <dt className="text-muted">{d.label}</dt>
                          <dd>
                            {formatValue(d, m.params?.[d.key])}
                            <span className="text-muted"> vs yours {formatValue(d, current[d.key])}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {m.notes && <p className="mt-2 text-sm">{m.notes}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
