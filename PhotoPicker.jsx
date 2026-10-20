import { useEffect, useRef } from 'react'

// Lets people choose photos (or take them, on a phone) and previews them
export default function PhotoPicker({ files, onChange, disabled = false, children }) {
  const latest = useRef(files)
  latest.current = files
  useEffect(() => () => latest.current.forEach((f) => URL.revokeObjectURL(f.preview)), [])

  function add(e) {
    const picked = [...e.target.files].map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))
    onChange([...files, ...picked])
    e.target.value = ''
  }

  function remove(id) {
    const f = files.find((x) => x.id === id)
    if (f) URL.revokeObjectURL(f.preview)
    onChange(files.filter((x) => x.id !== id))
  }

  return (
    <div className="flex flex-wrap gap-3">
      {children}
      {files.map((f) => (
        <div key={f.id} className="relative">
          <img src={f.preview} alt={`Selected photo ${f.file.name}`} className="h-24 w-24 rounded-md border border-line object-cover" />
          <button
            type="button"
            onClick={() => remove(f.id)}
            disabled={disabled}
            aria-label={`Remove ${f.file.name}`}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-paper"
          >
            ✕
          </button>
        </div>
      ))}
      <label className={`flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-line text-center text-sm text-muted hover:border-accent hover:text-ink ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
        <span className="text-2xl leading-none" aria-hidden="true">+</span>
        Add photos
        <input type="file" accept="image/*" multiple className="sr-only" onChange={add} disabled={disabled} />
      </label>
    </div>
  )
}
