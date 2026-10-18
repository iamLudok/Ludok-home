// Lectura mínima de iCalendar (RFC 5545) y de las respuestas CalDAV de
// Nextcloud, sin dependencias y sin nada nativo, para poder probarla en Node.
//
// No es un parser completo: lee lo que hace falta para la pestaña Hoy (título,
// inicio, fin, vencimiento, si está hecha). Las repeticiones NO se calculan
// aquí: se le pide al servidor que las expanda (`<C:expand>` en la consulta),
// que es quien las entiende de verdad. Calcular RRULE a mano es la forma más
// segura de enseñar un evento el día que no es.
import { dayOf } from './dates'
import type { DayString } from '../types'

export interface CalendarTask {
  uid: string
  title: string
  /** Día en que vence. Las tareas sin fecha no llegan a la pestaña Hoy. */
  due?: DayString
  /** Hora de vencimiento 'HH:MM', si la tiene. */
  dueTime?: string
  calendar: string
}

export interface CalendarEvent {
  uid: string
  title: string
  /** Instante de inicio en ms. En los de día completo, la medianoche local. */
  start: number
  end?: number
  allDay: boolean
  calendar: string
}

/** Desdobla las líneas partidas (RFC 5545 §3.1: continúan con espacio o tab). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

/** Quita los escapes de un valor de texto: \, \; \n */
function unescapeText(value: string): string {
  return value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const [name, ...rawParams] = head.split(';')
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const [k, v] = p.split('=')
    if (k && v !== undefined) params[k.toUpperCase()] = v.replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), params, value }
}

interface ParsedTime {
  ms: number
  allDay: boolean
  hasTime: boolean
}

/**
 * Interpreta una fecha iCal: «20261017» (día completo), «20261017T100000Z»
 * (UTC) o «20261017T100000» con o sin TZID.
 *
 * Con TZID se toma como hora local del móvil. Es un atajo consciente: el
 * calendario y el móvil están en la misma zona, y convertir zonas horarias de
 * verdad pediría una base de datos de zonas que la app no tiene. Para eventos
 * expandidos por el servidor no importa: Nextcloud los devuelve ya en UTC.
 */
export function parseIcalTime(value: string, params: Record<string, string> = {}): ParsedTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, hh, mi, ss, z] = m
  if (params.VALUE === 'DATE' || hh === undefined) {
    return { ms: new Date(+y, +mo - 1, +d).getTime(), allDay: true, hasTime: false }
  }
  const ms = z
    ? Date.UTC(+y, +mo - 1, +d, +hh, +mi, +(ss ?? 0))
    : new Date(+y, +mo - 1, +d, +hh, +mi, +(ss ?? 0)).getTime()
  return { ms, allDay: false, hasTime: true }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Bloques BEGIN:<tipo> … END:<tipo> de un .ics, como listas de propiedades. */
function blocks(ics: string, type: 'VTODO' | 'VEVENT'): Prop[][] {
  const out: Prop[][] = []
  let current: Prop[] | null = null
  let depth = 0
  for (const line of unfold(ics)) {
    if (line === `BEGIN:${type}`) {
      current = []
      depth = 0
      continue
    }
    if (line === `END:${type}`) {
      if (current) out.push(current)
      current = null
      continue
    }
    if (!current) continue
    // Las alarmas (VALARM) van dentro y tienen su propio SUMMARY/DESCRIPTION:
    // sin saltarlas, el título de la tarea acababa siendo el de su recordatorio.
    if (line.startsWith('BEGIN:')) depth++
    else if (line.startsWith('END:')) depth--
    else if (depth === 0) {
      const p = parseLine(line)
      if (p) current.push(p)
    }
  }
  return out
}

const get = (props: Prop[], name: string) => props.find((p) => p.name === name)

/** Tareas pendientes de un .ics. Las hechas o canceladas no salen. */
export function parseTasks(ics: string, calendar: string): CalendarTask[] {
  const out: CalendarTask[] = []
  for (const props of blocks(ics, 'VTODO')) {
    const status = get(props, 'STATUS')?.value.toUpperCase()
    if (status === 'COMPLETED' || status === 'CANCELLED') continue
    if (get(props, 'COMPLETED')) continue
    const percent = Number(get(props, 'PERCENT-COMPLETE')?.value ?? 0)
    if (percent >= 100) continue
    const title = unescapeText(get(props, 'SUMMARY')?.value ?? '')
    if (!title) continue
    const dueProp = get(props, 'DUE')
    const due = dueProp ? parseIcalTime(dueProp.value, dueProp.params) : null
    const dueDate = due ? new Date(due.ms) : undefined
    out.push({
      uid: get(props, 'UID')?.value ?? title,
      title,
      due: dueDate ? dayOf(dueDate) : undefined,
      dueTime: dueDate && due?.hasTime ? `${pad(dueDate.getHours())}:${pad(dueDate.getMinutes())}` : undefined,
      calendar,
    })
  }
  return out
}

/** Eventos de un .ics (ya expandidos por el servidor si se repiten). */
export function parseEvents(ics: string, calendar: string): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const props of blocks(ics, 'VEVENT')) {
    const status = get(props, 'STATUS')?.value.toUpperCase()
    if (status === 'CANCELLED') continue
    const startProp = get(props, 'DTSTART')
    const start = startProp ? parseIcalTime(startProp.value, startProp.params) : null
    if (!start) continue
    const endProp = get(props, 'DTEND')
    const end = endProp ? parseIcalTime(endProp.value, endProp.params) : null
    out.push({
      uid: (get(props, 'UID')?.value ?? '') + '|' + start.ms,
      title: unescapeText(get(props, 'SUMMARY')?.value ?? '') || '(sin título)',
      start: start.ms,
      end: end?.ms,
      allDay: start.allDay,
      calendar,
    })
  }
  return out
}

/** Tareas que tocan hoy: vencen hoy o ya se pasaron. Las sin fecha no. */
export function tasksForToday(tasks: CalendarTask[], todayDay: DayString): CalendarTask[] {
  return tasks
    .filter((t) => t.due !== undefined && t.due <= todayDay)
    .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99')))
}

/** Eventos que se solapan con el día local: los que empiezan, acaban o lo cruzan. */
export function eventsForDay(events: CalendarEvent[], day: DayString): CalendarEvent[] {
  const [y, m, d] = day.split('-').map(Number)
  const from = new Date(y, m - 1, d).getTime()
  const to = new Date(y, m - 1, d + 1).getTime()
  return events
    .filter((e) => {
      // Sin DTEND: un día completo dura ese día; uno con hora es un instante.
      const end = e.end ?? (e.allDay ? e.start + 86_400_000 : e.start + 1)
      return e.start < to && end > from
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
}

/* --- Respuestas CalDAV (XML multistatus) ---------------------------------- */

/** Deshace las entidades XML que pueden ir dentro de calendar-data. */
function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#13;/g, '\r')
    .replace(/&#10;/g, '\n')
    .replace(/&amp;/g, '&')
}

/**
 * Saca el texto de cada <calendar-data> de un multistatus. Por regex y no con
 * un parser XML a propósito: la forma de esta respuesta es fija, y un parser
 * sería la única dependencia de la app para leer un solo tipo de etiqueta. El
 * prefijo del espacio de nombres cambia entre servidores (cal:, C:, ninguno),
 * así que se acepta cualquiera.
 */
export function extractCalendarData(xml: string): string[] {
  const out: string[] = []
  const re = /<(?:[\w-]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?calendar-data>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    let body = m[1]
    const cdata = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(body)
    body = cdata ? cdata[1] : xmlUnescape(body)
    if (body.trim()) out.push(body)
  }
  return out
}

export interface CalendarRef {
  href: string
  name: string
  /** Si admite tareas (VTODO), eventos (VEVENT) o ambas. */
  todos: boolean
  events: boolean
}

/**
 * Calendarios de la respuesta a PROPFIND sobre /calendars/<usuario>/.
 * Se queda solo con los que son calendarios de verdad (resourcetype calendar),
 * no con la papelera, la bandeja de entrada ni las suscripciones.
 */
export function parseCalendarList(xml: string): CalendarRef[] {
  const out: CalendarRef[] = []
  const responses = xml.split(/<(?:[\w-]+:)?response[\s>]/).slice(1)
  for (const r of responses) {
    const href = /<(?:[\w-]+:)?href>([^<]+)<\/(?:[\w-]+:)?href>/.exec(r)?.[1]
    if (!href) continue
    const type = /<(?:[\w-]+:)?resourcetype>([\s\S]*?)<\/(?:[\w-]+:)?resourcetype>/.exec(r)?.[1] ?? ''
    if (!/<(?:[\w-]+:)?calendar\s*\/>/.test(type)) continue
    if (!/200 OK/.test(r)) continue
    const name = xmlUnescape(/<(?:[\w-]+:)?displayname>([^<]*)<\/(?:[\w-]+:)?displayname>/.exec(r)?.[1] ?? '') || href
    const comps = /<(?:[\w-]+:)?supported-calendar-component-set>([\s\S]*?)<\/(?:[\w-]+:)?supported-calendar-component-set>/.exec(r)?.[1]
    // Sin la lista de componentes, se pregunta por las dos cosas: es más barato
    // una consulta vacía que perderse las tareas de un calendario.
    out.push({
      href,
      name,
      todos: comps ? /name="VTODO"/.test(comps) : true,
      events: comps ? /name="VEVENT"/.test(comps) : true,
    })
  }
  return out
}

/** Instante en el formato UTC que pide CalDAV: 20261017T000000Z */
export function caldavUtc(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop>
</d:propfind>`

/** Tareas no completadas. El filtro por fecha se hace aquí, no en el servidor: las atrasadas también cuentan. */
export const REPORT_TODOS = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO">
    <c:prop-filter name="COMPLETED"><c:is-not-defined/></c:prop-filter>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`

/** Eventos de [from, to), con las repeticiones expandidas por el servidor. */
export function reportEvents(fromMs: number, toMs: number): string {
  const from = caldavUtc(fromMs)
  const to = caldavUtc(toMs)
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data><c:expand start="${from}" end="${to}"/></c:calendar-data></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${from}" end="${to}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`
}
