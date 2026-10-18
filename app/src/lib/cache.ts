// Caché de lo que viene de Nextcloud (tareas y eventos de hoy), para que la
// pestaña Hoy enseñe algo aunque no haya conexión. Sin nada nativo.
import { eq } from 'drizzle-orm'
import { getDb } from './dbRef'
import { cache as cacheTable } from './schema'

export interface Cached<T> {
  value: T
  fetchedAt: number
}

export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  const rows = await getDb().select().from(cacheTable).where(eq(cacheTable.key, key)).limit(1)
  if (!rows[0]) return null
  try {
    return { value: JSON.parse(rows[0].value) as T, fetchedAt: rows[0].fetchedAt }
  } catch {
    // Una caché rota se trata como vacía: se vuelve a pedir y listo.
    return null
  }
}

export async function writeCache<T>(key: string, value: T, fetchedAt = Date.now()): Promise<void> {
  const row = { key, value: JSON.stringify(value), fetchedAt }
  await getDb().insert(cacheTable).values(row).onConflictDoUpdate({ target: cacheTable.key, set: row })
}
