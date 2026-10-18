/**
 * Lectura de tareas y eventos de Nextcloud (CalDAV), sin red.
 *
 * Las respuestas de prueba imitan la forma EXACTA que devuelve Nextcloud
 * (sabre/dav): prefijos d: y cal:, un propstat con 404 para las propiedades que
 * faltan, tarjetas de Deck como VTODO… con datos inventados.
 */
import { check, eq, finish } from './harness'
import {
  eventsForDay,
  extractCalendarData,
  parseCalendarList,
  parseEvents,
  parseIcalTime,
  parseTasks,
  tasksForToday,
} from '../src/lib/ical'

const PROPFIND = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:nc="http://nextcloud.org/ns">
<d:response><d:href>/remote.php/dav/calendars/luken/</d:href>
  <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  <d:propstat><d:prop><d:displayname/><cal:supported-calendar-component-set/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>
</d:response>
<d:response><d:href>/remote.php/dav/calendars/luken/personal/</d:href>
  <d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><d:displayname>Personal</d:displayname>
  <cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>
<d:response><d:href>/remote.php/dav/calendars/luken/app-generated--deck--board-2/</d:href>
  <d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><d:displayname>Deck: Casa &amp; coche</d:displayname>
  <cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>
<d:response><d:href>/remote.php/dav/calendars/luken/trashbin/</d:href>
  <d:propstat><d:prop><d:resourcetype><d:collection/><nc:trash-bin/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response>
</d:multistatus>`

const TODOS_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Nextcloud Deck//EN',
  'BEGIN:VTODO',
  'UID:deck-card-1',
  'STATUS:NEEDS-ACTION',
  'SUMMARY:Pasar la ITV',
  'DUE:20261017T160000Z',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'SUMMARY:Recordatorio de la alarma',
  'END:VALARM',
  'END:VTODO',
  'BEGIN:VTODO',
  'UID:deck-card-2',
  'SUMMARY:Llamar al taller\\, que no se me ',
  ' olvide',
  'DUE;VALUE=DATE:20261003',
  'END:VTODO',
  'BEGIN:VTODO',
  'UID:deck-card-3',
  'STATUS:COMPLETED',
  'SUMMARY:Ya hecha',
  'DUE:20261001T080000Z',
  'END:VTODO',
  'BEGIN:VTODO',
  'UID:deck-card-4',
  'SUMMARY:Sin fecha',
  'END:VTODO',
  'BEGIN:VTODO',
  'UID:deck-card-5',
  'SUMMARY:Para mañana',
  'DUE;TZID=Europe/Madrid:20261018T090000',
  'END:VTODO',
  'BEGIN:VTODO',
  'UID:deck-card-6',
  'PERCENT-COMPLETE:100',
  'SUMMARY:Al cien por cien',
  'DUE:20261010T080000Z',
  'END:VTODO',
  'END:VCALENDAR',
].join('\r\n')

const REPORT = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
<d:response><d:href>/remote.php/dav/calendars/luken/app-generated--deck--board-2/card-1.ics</d:href>
<d:propstat><d:prop><cal:calendar-data>${TODOS_ICS.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</cal:calendar-data></d:prop>
<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`

const EVENTS_ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:e1',
  'SUMMARY:Dentista',
  'DTSTART:20261017T080000Z',
  'DTEND:20261017T090000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:e2',
  'SUMMARY:Cumpleaños',
  'DTSTART;VALUE=DATE:20261017',
  'DTEND;VALUE=DATE:20261018',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:e3',
  'SUMMARY:Cancelado',
  'STATUS:CANCELLED',
  'DTSTART:20261017T100000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:e4',
  'SUMMARY:Viaje',
  'DTSTART;VALUE=DATE:20261015',
  'DTEND;VALUE=DATE:20261020',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:e5',
  'SUMMARY:Ayer',
  'DTSTART:20261016T080000Z',
  'DTEND:20261016T090000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\n')

function main() {
  console.log('Lista de calendarios')
  const cals = parseCalendarList(PROPFIND)
  eq('solo los calendarios de verdad (ni la raíz ni la papelera)', cals.length, 2)
  eq('nombre con entidades XML', cals[1].name, 'Deck: Casa & coche')
  check('Personal solo tiene eventos', cals[0].events && !cals[0].todos)
  check('el tablero de Deck solo tiene tareas', cals[1].todos && !cals[1].events)

  console.log('\nTareas')
  const icsList = extractCalendarData(REPORT)
  eq('saca el calendar-data escapado', icsList.length, 1)
  const tasks = parseTasks(icsList[0], 'Deck')
  eq('fuera las hechas y las del 100 %', tasks.length, 4)
  eq('el título es el de la tarea, no el de su alarma', tasks[0].title, 'Pasar la ITV')
  eq('línea partida y comas escapadas', tasks[1].title, 'Llamar al taller, que no se me olvide')
  eq('vencimiento de día completo', tasks[1].due, '2026-10-03')
  eq('sin hora en las de día completo', tasks[1].dueTime, undefined)
  const forToday = tasksForToday(tasks, '2026-10-17')
  eq('hoy: la de hoy y la atrasada, no la de mañana ni la sin fecha', forToday.map((t) => t.title.slice(0, 5)).join(), 'Llama,Pasar')
  eq('con TZID se toma como hora local', parseIcalTime('20261018T090000', { TZID: 'Europe/Madrid' })!.ms, new Date(2026, 9, 18, 9, 0).getTime())
  eq('una fecha rota no se interpreta', parseIcalTime('mañana'), null)
  eq('CDATA también vale', extractCalendarData('<cal:calendar-data><![CDATA[BEGIN:VCALENDAR]]></cal:calendar-data>')[0], 'BEGIN:VCALENDAR')

  console.log('\nEventos')
  const events = parseEvents(EVENTS_ICS, 'Personal')
  eq('fuera los cancelados', events.length, 4)
  const day = eventsForDay(events, '2026-10-17')
  eq('hoy: los de día completo primero, luego por hora', day.map((e) => e.title).join(), 'Viaje,Cumpleaños,Dentista')
  check('el de ayer no sale hoy', !day.some((e) => e.title === 'Ayer'))
  eq('el fin de un día completo es exclusivo', eventsForDay(events, '2026-10-18').map((e) => e.title).join(), 'Viaje')

  finish('verify:caldav')
}

main()
