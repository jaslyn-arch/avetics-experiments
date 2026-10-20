import { supabase } from '../supabase'

export const BUCKET = 'run-photos'

// Photos are shrunk in the browser before upload: a 1600 px version to
// view and a 400 px thumbnail for lists. This keeps uploads quick and
// Supabase's free 1 GB of storage good for thousands of photos.

async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall back */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This browser can’t read that image type. Try a JPG or PNG.')) }
    img.src = url
  })
}

function resize(img, maxSide, quality) {
  const w = img.width
  const h = img.height
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff' // transparent PNGs get a white background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t process the image.'))), 'image/jpeg', quality)
  )
}

export async function uploadRunPhotos(runId, files) {
  const failed = []
  const store = supabase.storage.from(BUCKET)
  for (const file of files) {
    try {
      const img = await loadImage(file)
      const [full, thumb] = await Promise.all([resize(img, 1600, 0.82), resize(img, 400, 0.72)])
      const id = crypto.randomUUID()
      const path = `${runId}/${id}.jpg`
      const thumbPath = `${runId}/${id}_thumb.jpg`

      const a = await store.upload(path, full, { contentType: 'image/jpeg' })
      if (a.error) throw a.error
      const b = await store.upload(thumbPath, thumb, { contentType: 'image/jpeg' })
      if (b.error) { await store.remove([path]); throw b.error }

      const { error } = await supabase.from('run_photos').insert({ run_id: runId, path, thumb_path: thumbPath })
      if (error) { await store.remove([path, thumbPath]); throw error }
    } catch (e) {
      failed.push(`${file.name}: ${e.message}`)
    }
  }
  return failed
}

// Private bucket, so photos are shown through links that expire after a few hours
export async function signPhotos(photos) {
  const out = {}
  for (let i = 0; i < photos.length; i += 300) {
    const chunk = photos.slice(i, i + 300)
    const paths = chunk.flatMap((p) => [p.path, p.thumb_path])
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6)
    if (error) throw error
    const byPath = Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
    for (const p of chunk) out[p.id] = { full: byPath[p.path], thumb: byPath[p.thumb_path] }
  }
  return out
}

async function removeFiles(paths) {
  for (let i = 0; i < paths.length; i += 900) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 900))
    if (error) throw error
  }
}

export async function deletePhotos(photos) {
  if (!photos.length) return
  await removeFiles(photos.flatMap((p) => [p.path, p.thumb_path]))
  const { error } = await supabase.from('run_photos').delete().in('id', photos.map((p) => p.id))
  if (error) throw error
}

// Called before deleting a run or machine; the database rows go automatically
export async function deletePhotoFilesFor({ runId, machineId }) {
  let query = supabase.from('run_photos').select('path, thumb_path, runs!inner(machine_id)')
  query = runId ? query.eq('run_id', runId) : query.eq('runs.machine_id', machineId)
  const { data, error } = await query
  if (error) throw error
  await removeFiles(data.flatMap((p) => [p.path, p.thumb_path]))
}
