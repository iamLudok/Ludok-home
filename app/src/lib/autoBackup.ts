import { exportAll } from './backup'
import { getSettings, updateSettings } from './settings'
import { configFrom, uploadFile } from './nextcloud'
import { isDue, backupFilename } from './backupPolicy'

export { STALE_DAYS, autoBackupIsStale } from './backupPolicy'

/**
 * Copia automática a tu Nextcloud.
 *
 * Se dispara al abrir la app (y al volver a ella), no con una tarea en segundo
 * plano: Android mata esas tareas de forma agresiva y encima serían invisibles.
 * Como la app se abre a diario para marcar las medicinas, en la práctica la
 * copia acaba siendo diaria sin que haya que acordarse de nada.
 *
 * A diferencia de Ludok Time, NO exige WiFi: con Tailscale el servidor está
 * igual de a mano con datos móviles, y la copia pesa unos pocos KB. Si no hay
 * forma de llegar, falla en silencio y se reintenta la próxima vez que abras
 * la app; eso es justo lo de «se guarda en local y se sube cuando vuelva la
 * conexión», porque lo local es siempre la copia buena.
 */

export type AutoBackupResult =
  | { status: 'ok'; filename: string }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; message: string }

/** Sube la copia ahora mismo, sin mirar cuánto hace de la última. */
export async function backupNow(): Promise<AutoBackupResult> {
  const settings = await getSettings()
  const config = configFrom(settings)
  if (!config) return { status: 'skipped', reason: 'Falta configurar Nextcloud.' }

  try {
    const data = await exportAll()
    const filename = backupFilename()
    await uploadFile(config, filename, JSON.stringify(data, null, 2))
    const now = Date.now()
    // `lastBackup` también, para que el aviso de «llevas X días sin copia» se
    // entere: una copia subida a tu servidor cuenta como copia.
    await updateSettings({ lastAutoBackupAt: now, lastBackup: now })
    return { status: 'ok', filename }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Error desconocido' }
  }
}

/**
 * La llama la app al arrancar y al volver del segundo plano. Comprueba ella
 * misma si toca, así que se puede invocar sin miedo tantas veces como haga falta.
 */
export async function maybeAutoBackup(): Promise<AutoBackupResult> {
  const settings = await getSettings()
  if (!settings.autoBackup) return { status: 'skipped', reason: 'Desactivada.' }
  if (!configFrom(settings)) return { status: 'skipped', reason: 'Falta configurar Nextcloud.' }
  if (!isDue(settings.lastAutoBackupAt)) return { status: 'skipped', reason: 'Ya se hizo hace poco.' }
  return backupNow()
}
