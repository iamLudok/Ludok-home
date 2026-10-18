// Noticias del día: el audio que genera la Pi cada mañana y su índice.
//
// La Pi deja `noticias.ogg` y `noticias.json` en tu carpeta de Nextcloud. La app
// los DESCARGA al móvil en cuanto puede llegar al servidor y los reproduce
// desde ahí. Reproducirlos directamente desde Nextcloud funcionaría en casa,
// pero no en el coche sin cobertura, que es justo donde más se escuchan.
import { File, Paths } from 'expo-file-system'
import { getSettings } from './settings'
import { authHeader, configFrom, fileUrl, readTextFile } from './nextcloud'

export interface NewsItem {
  feed: string
  titulo: string
  /** Segundo del audio en que empieza la noticia. */
  inicio: number
}

export interface NewsIndex {
  fecha: string
  generado: string
  duracion: number
  noticias: NewsItem[]
}

export interface LocalNews {
  index: NewsIndex
  audioUri: string
}

const AUDIO = 'noticias.ogg'
const INDEX = 'noticias.json'

function parseIndex(raw: string): NewsIndex | null {
  try {
    const data = JSON.parse(raw)
    if (typeof data?.generado !== 'string' || !Array.isArray(data.noticias)) return null
    return data as NewsIndex
  } catch {
    return null
  }
}

/** Lo que ya hay descargado en el móvil, o null. */
export async function localNews(): Promise<LocalNews | null> {
  const index = new File(Paths.document, INDEX)
  const audio = new File(Paths.document, AUDIO)
  if (!index.exists || !audio.exists) return null
  const parsed = parseIndex(await index.text())
  return parsed ? { index: parsed, audioUri: audio.uri } : null
}

export type NewsSyncResult =
  | { status: 'nuevo' | 'igual'; news: LocalNews }
  | { status: 'sin-noticias' }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; message: string }

/**
 * Descarga las noticias si en Nextcloud hay unas más nuevas que las del móvil.
 * Se compara el `generado` del índice: el audio solo se baja cuando cambia.
 */
export async function syncNews(): Promise<NewsSyncResult> {
  const config = configFrom(await getSettings())
  if (!config) return { status: 'skipped', reason: 'Falta configurar Nextcloud.' }
  try {
    const raw = await readTextFile(config, INDEX)
    if (raw === null) return { status: 'sin-noticias' }
    const remote = parseIndex(raw)
    if (!remote) return { status: 'error', message: 'El índice de noticias está roto.' }

    const local = await localNews()
    if (local && local.index.generado === remote.generado) return { status: 'igual', news: local }

    // Primero el audio y después el índice: si la descarga se corta, el índice
    // viejo sigue apuntando a su audio viejo y no a uno a medias.
    const audio = await File.downloadFileAsync(fileUrl(config, AUDIO), new File(Paths.document, AUDIO), {
      headers: { Authorization: authHeader(config) },
      idempotent: true,
    })
    const index = new File(Paths.document, INDEX)
    index.create({ overwrite: true })
    index.write(raw)
    return { status: 'nuevo', news: { index: remote, audioUri: audio.uri } }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Error desconocido' }
  }
}
