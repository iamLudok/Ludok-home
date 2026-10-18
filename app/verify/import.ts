/**
 * Verificación de la importación desde las notas del bot de Telegram.
 *
 * Las notas de prueba tienen el formato EXACTO que escribía el bot
 * (Ludok-home/notes/*.py), con los casos raros que se dan de verdad: comas en
 * la descripción, líneas a medias, medicinas que ya no están en la pauta.
 *
 * Con un argumento, prueba además un fichero JSON con las notas reales
 * ([{title, content}, ...]) sin guardarlo en ningún sitio:
 *   npx tsx verify/import.ts /ruta/notas.json
 */
import { readFileSync } from 'node:fs'
import { check, eq, finish, freshDb, freshDbAsCurrent } from './harness'
import { applyNotesImport, NOTE_TITLES, parseCarNote, parseMedicineConfig, type NoteContent } from '../src/lib/notesImportCore'
import { exportAll } from '../src/lib/backupCore'
import { medicinesForDay, adherence } from '../src/lib/medicines'

const NOTES: NoteContent[] = [
  {
    title: NOTE_TITLES.car,
    content: [
      '2026-06-01,gasolina,40.0,1.659,66.36',
      '2026-06-15,taller,Cambio de aceite, filtro y revisión,180.5',
      '2026-07-02,recambio,Escobillas,19.99',
      '2026-07-03,gasolina,35,1.6',          // a medias: falta el total
      'esto no es una línea',
      '',
    ].join('\n'),
  },
  {
    title: NOTE_TITLES.medicineConfig,
    content: [
      '# Una medicina por línea:',
      '# nombre,cada_dias,hora_toma,aviso1,aviso2,...',
      'Elebrato,1,08:00,09:30,13:00',
      'FML gotas,2,21:00,22:00,22:30',
      'Rota,x,08:00',
    ].join('\n'),
  },
  {
    title: NOTE_TITLES.medicineHistory,
    content: [
      '2026-04-10,Relvar,Rolufta',
      '2026-10-15,Elebrato,FML gotas',
      '2026-10-16,Elebrato',
      '2026-10-16,Elebrato',                 // repetida
    ].join('\n'),
  },
  { title: NOTE_TITLES.shopping, content: '- Leche\n- Pan integral\n\n' },
  {
    title: NOTE_TITLES.wishlist,
    content: JSON.stringify([{ nombre: 'Auriculares', url: 'https://example.com/a' }, { url: 'sin nombre' }], null, 2),
  },
  { title: NOTE_TITLES.gifts, content: JSON.stringify([{ nombre: 'Libro', url: '' }]) },
]

async function fixture() {
  console.log('Lectura de cada nota')
  const issues: { note: string; line: string }[] = []
  const car = parseCarNote(NOTES[0].content, issues)
  eq('entran los tres gastos bien escritos', car.length, 3)
  eq('la descripción conserva sus comas', car[1].description, 'Cambio de aceite, filtro y revisión')
  eq('el importe del taller en céntimos', car[1].totalCents, 18050)
  eq('el total del bot manda sobre litros × precio', car[0].totalCents, 6636)
  eq('las dos líneas rotas se apuntan, no se pierden en silencio', issues.length, 2)
  const config = parseMedicineConfig(NOTES[1].content)
  eq('los comentarios no son medicinas', config.length, 2)
  eq('los avisos de FML', config[1].reminders.join(), '22:00,22:30')

  console.log('\nImportación completa')
  const db = await freshDbAsCurrent()
  const now = Date.UTC(2026, 9, 17, 12)
  const res = await applyNotesImport(db, NOTES, now)
  eq('gastos importados', res.carExpenses, 3)
  eq('medicinas activas', res.medicines, 2)
  eq('las que ya no están en la pauta entran desactivadas', res.inactiveMedicines.join(), 'Relvar,Rolufta')
  eq('tomas sin la repetida', res.intakes, 5)
  eq('elementos de las tres listas', res.listItems, 4)
  eq('no falta ninguna nota', res.missingNotes.length, 0)
  check('la entrada de la wishlist sin nombre se apunta', res.issues.some((i) => i.note === NOTE_TITLES.wishlist))
  check('la medicina mal escrita se apunta', res.issues.some((i) => i.line.startsWith('Rota')))

  const data = await exportAll(db)
  const byName = (n: string) => data.medicines.find((m) => m.name === n)!
  eq('fecha de inicio: la primera vez que sale en el historial', byName('Elebrato').startDate, '2026-10-15')
  eq('Relvar empieza cuando empezó', byName('Relvar').startDate, '2026-04-10')
  eq('Relvar no está activa', byName('Relvar').active, false)
  eq('el enlace vacío de regalos no se guarda', data.listItems.find((i) => i.name === 'Libro')?.url, undefined)
  eq('la compra conserva el orden de la nota', data.listItems.filter((i) => i.list === 'compra').sort((a, b) => a.createdAt - b.createdAt).map((i) => i.name).join(), 'Leche,Pan integral')

  const todayList = medicinesForDay(data.medicines, data.intakes, '2026-10-17')
  eq('hoy tocan Elebrato y FML (cada 48 h desde el 15)', todayList.map((t) => t.medicine.name).join(), 'Elebrato,FML gotas')
  const adh = adherence(data.medicines, data.intakes, '2026-10-01', '2026-10-17', '2026-10-17')
  check('Elebrato no cuenta olvidos antes de su primera toma', adh.find((r) => r.medicine.name === 'Elebrato')!.days.filter((d) => d.state === 'olvidada').length === 0)

  console.log('\nNo se puede importar dos veces')
  try {
    await applyNotesImport(db, NOTES, now)
    check('la segunda importación se rechaza', false)
  } catch (err) {
    check('la segunda importación se rechaza', /ya se importaron/.test((err as Error).message))
  }
  eq('y no ha duplicado nada', (await exportAll(db)).carExpenses.length, 3)

  console.log('\nNotas que faltan')
  const empty = await freshDb()
  const partial = await applyNotesImport(empty, [NOTES[0]], now)
  eq('se importa lo que hay', partial.carExpenses, 3)
  eq('y se dice qué notas faltaban', partial.missingNotes.length, 5)
}

async function real(path: string) {
  console.log(`\nNotas reales: ${path}`)
  const notes: NoteContent[] = JSON.parse(readFileSync(path, 'utf8'))
  const db = await freshDb()
  const res = await applyNotesImport(db, notes)
  console.log(`  gastos ${res.carExpenses} · medicinas ${res.medicines} (+${res.inactiveMedicines.length} desactivadas: ${res.inactiveMedicines.join(', ') || 'ninguna'}) · tomas ${res.intakes} · listas ${res.listItems}`)
  for (const i of res.issues) console.log(`  línea no entendida en «${i.note}»: ${i.line}`)
  eq('no falta ninguna nota', res.missingNotes.join(', '), '')
  check('ninguna línea sin entender', res.issues.length === 0, `${res.issues.length} líneas`)
  const data = await exportAll(db)
  check('ningún gasto con importe cero o negativo', data.carExpenses.every((e) => e.totalCents > 0))
  check('todas las tomas tienen su medicina', data.intakes.every((i) => data.medicines.some((m) => m.id === i.medicineId)))
}

async function main() {
  await fixture()
  if (process.argv[2]) await real(process.argv[2])
  finish('verify:import')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
