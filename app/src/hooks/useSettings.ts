import { eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { db } from '../lib/db'
import { settings as settingsTable } from '../lib/schema'
import { rowToSettings } from '../lib/rows'
import { DEFAULT_SETTINGS } from '../lib/backupCore'
import type { Settings } from '../types'

/**
 * Ajustes actuales, reactivos. Está aquí y no en `lib/settings.ts` porque
 * `useLiveQuery` es de expo-sqlite y solo funciona en el móvil; así la lógica de
 * ajustes sigue siendo probable en el escritorio.
 */
export function useSettings(): Settings {
  return useSettingsQuery().data
}

/**
 * Igual, pero diciendo además si ya hay respuesta. Importa donde la ausencia de
 * un valor cambia lo que se enseña: sin esto, la pestaña Hoy mostraría «configura
 * Nextcloud» durante un instante aunque estuviera configurado, porque
 * `useLiveQuery` arranca con la lista vacía.
 */
export function useSettingsQuery(): { data: Settings; ready: boolean } {
  const { data, updatedAt } = useLiveQuery(
    db.select().from(settingsTable).where(eq(settingsTable.id, 'app')),
  )
  return {
    data: data?.[0] ? rowToSettings(data[0]) : DEFAULT_SETTINGS,
    ready: updatedAt !== undefined,
  }
}
