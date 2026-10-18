// Datos de la pestaña Hoy que vienen de Nextcloud: tareas y eventos.
//
// Se piden al abrir la app y al volver a ella, y se guardan en la caché. Si no
// hay conexión se enseña lo último que se trajo, con la hora a la que se trajo:
// es mejor una lista de esta mañana que una pantalla vacía en el metro.
import { getSettings } from './settings'
import { configFrom, fetchCalendars, type TodayData } from './nextcloud'
import { readCache, writeCache, type Cached } from './cache'

export const TODAY_CACHE_KEY = 'today'

export type RefreshResult =
  | { status: 'ok'; data: Cached<TodayData> }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; message: string }

/**
 * Trae las tareas pendientes y los eventos de ayer a mañana. El margen de un
 * día por cada lado es para que, si la app se queda abierta al cambiar de día,
 * la caché aún tenga los eventos de «hoy» sin volver a pedirlos.
 */
export async function refreshToday(now = new Date()): Promise<RefreshResult> {
  const config = configFrom(await getSettings())
  if (!config) return { status: 'skipped', reason: 'Falta configurar Nextcloud.' }
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).getTime()
  try {
    const data = await fetchCalendars(config, from, to)
    const fetchedAt = Date.now()
    await writeCache(TODAY_CACHE_KEY, data, fetchedAt)
    return { status: 'ok', data: { value: data, fetchedAt } }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Error desconocido' }
  }
}

export function cachedToday(): Promise<Cached<TodayData> | null> {
  return readCache<TodayData>(TODAY_CACHE_KEY)
}
