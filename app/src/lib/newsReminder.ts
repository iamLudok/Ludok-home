// Hora del aviso diario de las noticias. Sin nada nativo, para probarlo en Node.
import { isValidTime } from './dates'
import type { Settings, TimeString } from '../types'

/**
 * Antes de salir de casa (sobre las 6:30): tocar el aviso abre la app, que
 * descarga el audio con la WiFi de casa para escucharlo en el coche sin
 * cobertura. La Pi lo genera a las 5:45.
 */
export const DEFAULT_NEWS_REMINDER: TimeString = '06:15'

/**
 * La hora del aviso, o null si está apagado. Lo que no se entiende cuenta como
 * la hora por defecto: un valor raro en la base no puede dejarte sin el aviso
 * sin que te enteres.
 */
export function newsReminderTime(s: Pick<Settings, 'newsReminder'>): TimeString | null {
  if (s.newsReminder === 'off') return null
  return s.newsReminder && isValidTime(s.newsReminder) ? s.newsReminder : DEFAULT_NEWS_REMINDER
}
