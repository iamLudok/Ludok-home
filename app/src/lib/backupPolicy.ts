/**
 * Cuándo toca hacer copia y cuándo hay que dar la voz de alarma.
 *
 * Vive aparte de `autoBackup.ts` porque aquel importa ficheros nativos, y estas
 * decisiones son las que de verdad conviene poder probar: son las que deciden
 * si te enteras o no de que llevas días sin copia.
 */

/** Tiempo mínimo entre subidas automáticas. */
export const EVERY_MS = 12 * 60 * 60 * 1000

/** A partir de aquí, la copia automática lleva demasiado sin llegar y se avisa. */
export const STALE_DAYS = 4

/** Si ya toca volver a subir. */
export function isDue(lastAutoBackupAt: number | undefined, now = Date.now()): boolean {
  return now - (lastAutoBackupAt ?? 0) >= EVERY_MS
}

/**
 * Si la copia automática está encendida pero lleva demasiado sin subir nada.
 *
 * Es el punto flaco de hacerlo al abrir la app: si la Pi lleva días caída, o
 * has estado fuera sin Tailscale, o la contraseña ha caducado, todo falla en
 * silencio y te crees respaldado sin estarlo. Esto lo saca a la luz.
 */
export function autoBackupIsStale(
  settings: { autoBackup?: boolean; lastAutoBackupAt?: number },
  now = Date.now(),
): boolean {
  if (!settings.autoBackup) return false
  return now - (settings.lastAutoBackupAt ?? 0) > STALE_DAYS * 86_400_000
}

/** Nombre del fichero: uno por día, para que quede histórico y no una sola copia. */
export function backupFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `ludok-home-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}
