/**
 * Verificación del formato de copia: la ida y vuelta de los datos.
 *
 * Ejecuta el MISMO `backupCore` que corre en el móvil, contra un SQLite de
 * escritorio creado con el mismo DDL que la app. Mientras esto pase, una copia
 * exportada se puede restaurar sin perder nada.
 */
import { check, eq, finish, freshDb } from './harness'
import { exportAll, importBackup, readSettings, writeSettings } from '../src/lib/backupCore'
import { carExpenses, deviceNames, intakes, listItems, medicines, quickNotes, savedLinks } from '../src/lib/schema'
import { carExpenseToRow, intakeToRow, listItemToRow, medicineToRow, quickNoteToRow, savedLinkToRow } from '../src/lib/rows'
import { addDays } from '../src/lib/dates'
import type { BackupFile, CarExpense, ListItem, Medicine, MedicineIntake, QuickNote, SavedLink } from '../src/types'

/* --- Datos de prueba con todos los huecos posibles ------------------------ */

const fuel: CarExpense = {
  id: 'c1', date: '2026-07-03', kind: 'gasolina', totalCents: 6638,
  liters: 40, pricePerLiter: 1.659, odometerKm: 123456, createdAt: 1,
}
// Sin litros ni kilómetros: los opcionales tienen que salir como ausentes, no null.
const workshop: CarExpense = {
  id: 'c2', date: '2026-07-10', kind: 'taller', totalCents: 18000,
  description: 'Cambio de aceite, filtros', createdAt: 2,
}
const daily: Medicine = {
  id: 'm1', name: 'Elebrato', everyDays: 1, time: '08:00', reminders: ['09:30', '13:00'],
  startDate: '2026-04-10', active: true, createdAt: 3,
}
const every2: Medicine = {
  id: 'm2', name: 'FML gotas', everyDays: 2, time: '21:00', reminders: [],
  startDate: '2026-04-10', active: true, createdAt: 4,
}
const old: Medicine = {
  id: 'm3', name: 'Relvar', everyDays: 1, time: '08:00', reminders: ['09:30'],
  startDate: '2026-04-10', active: false, createdAt: 5,
}
const taken: MedicineIntake[] = [
  { id: 'i1', medicineId: 'm1', date: '2026-10-16', takenAt: 10 },
  { id: 'i2', medicineId: 'm2', date: '2026-10-15', takenAt: 11 },
  { id: 'i3', medicineId: 'm3', date: '2026-09-01', takenAt: 12 },
]
const items: ListItem[] = [
  { id: 'l1', list: 'compra', name: 'Leche', done: false, createdAt: 20 },
  { id: 'l2', list: 'wishlist', name: 'Auriculares', url: 'https://example.com/a', done: false, createdAt: 21 },
  { id: 'l3', list: 'regalos', name: 'Libro', done: true, doneAt: 99, createdAt: 22, forWhom: 'Laura' },
  { id: 'l4', list: 'wishlist', name: 'Zapatillas', done: false, createdAt: 23, imageUrl: 'https://img/z.jpg', photo: 'l4.jpg' },
]
const notes: QuickNote[] = [
  { id: 'n1', text: 'Llamar al taller', forDay: '2026-10-18', done: false, createdAt: 30 },
  { id: 'n2', text: 'Idea', done: true, doneAt: 31, createdAt: 31 },
]
const saved: SavedLink[] = [
  { id: 's1', url: 'https://www.instagram.com/reel/A/', kind: 'video', tags: ['receta', 'cena'], done: false, createdAt: 40 },
  { id: 's2', url: 'https://ana.dev/', title: 'Portfolio', kind: 'web', tags: [], imageUrl: 'https://ana.dev/og.png', note: 'Mirar la tipografía', done: true, doneAt: 41, createdAt: 41 },
]

async function seed() {
  const db = await freshDb()
  await db.insert(carExpenses).values([fuel, workshop].map(carExpenseToRow))
  await db.insert(medicines).values([daily, every2, old].map(medicineToRow))
  await db.insert(intakes).values(taken.map(intakeToRow))
  await db.insert(listItems).values(items.map(listItemToRow))
  await db.insert(quickNotes).values(notes.map(quickNoteToRow))
  await db.insert(savedLinks).values(saved.map(savedLinkToRow))
  await db.insert(deviceNames).values([{ mac: '00:1a:2b:3c:4d:5e', name: 'Router' }])
  await writeSettings(db, {
    ...(await readSettings(db)),
    theme: 'dark',
    nextcloudUrl: 'http://100.64.0.1:8080',
    nextcloudUser: 'luken',
    nextcloudPassword: 'secreta',
    dockerUrl: 'http://100.64.0.1:2375',
    dockerLanUrl: 'http://192.168.1.50:2375',
    dockerUser: 'ludok',
    dockerPassword: 'docker-secreta',
    nextcloudFolder: 'Ludok Home',
    autoBackup: true,
    notesImportedAt: 1234,
    contractDownMbps: 600,
    contractUpMbps: 600,
    weatherPlace: 'Bilbao',
    weatherLat: 43.26271,
    weatherLon: -2.92528,
  })
  return db
}

/** Copia sin la marca de tiempo de exportación, para comparar dos exportaciones. */
function stable(b: BackupFile): string {
  const { exportedAt: _t, ...rest } = b
  const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, c) => a.id.localeCompare(c.id))
  return JSON.stringify({
    ...rest,
    carExpenses: sortById(rest.carExpenses),
    medicines: sortById(rest.medicines),
    intakes: sortById(rest.intakes),
    listItems: sortById(rest.listItems),
    notes: sortById(rest.notes ?? []),
    saved: sortById(rest.saved ?? []),
    deviceNames: [...(rest.deviceNames ?? [])].sort((a, b) => a.mac.localeCompare(b.mac)),
  })
}

async function main() {
  console.log('Ida y vuelta')
  const a = await seed()
  const exported = await exportAll(a)
  eq('gastos exportados', exported.carExpenses.length, 2)
  eq('medicinas exportadas', exported.medicines.length, 3)
  eq('tomas exportadas', exported.intakes.length, 3)
  eq('elementos de lista exportados', exported.listItems.length, 4)
  eq('notas exportadas', exported.notes?.length, 2)
  eq('guardados exportados', exported.saved?.length, 2)
  eq('nombres de dispositivos exportados', exported.deviceNames?.[0]?.name, 'Router')
  eq('las etiquetas salen como lista', JSON.stringify(exported.saved?.find((l) => l.id === 's1')?.tags), '["receta","cena"]')
  eq('para quién del regalo', exported.listItems.find((i) => i.id === 'l3')?.forWhom, 'Laura')
  check('las fotos no las mete el núcleo (las añade la parte nativa)', exported.photos === undefined)
  const json = JSON.stringify(exported)
  check('la copia no lleva ningún null', !json.includes('null'))
  check('la contraseña de Nextcloud NO va en la copia', !json.includes('"secreta"'))
  check('la contraseña de Docker NO va en la copia', !json.includes('docker-secreta'))
  eq('los avisos salen como lista', JSON.stringify(exported.medicines.find((m) => m.id === 'm1')?.reminders), '["09:30","13:00"]')
  eq('el booleano activo sale como booleano', exported.medicines.find((m) => m.id === 'm3')?.active, false)
  eq('el precio con tres decimales no se redondea', exported.carExpenses.find((e) => e.id === 'c1')?.pricePerLiter, 1.659)
  const parsedBack: BackupFile = JSON.parse(json)
  check('un opcional vacío no aparece en el fichero', !('liters' in parsedBack.carExpenses.find((e) => e.id === 'c2')!))

  const b = await freshDb()
  const res = await importBackup(b, json)
  eq('importa todos los gastos', res.carExpenses, 2)
  eq('importa todas las tomas', res.intakes, 3)
  eq('no descarta ninguna toma', res.discardedIntakes, 0)
  const again = await exportAll(b)
  eq('exportar → importar → exportar da lo mismo', stable(again), stable({ ...exported, settings: again.settings }))
  const restored = await readSettings(b)
  eq('restaura la carpeta de Nextcloud', restored.nextcloudFolder, 'Ludok Home')
  eq('restaura la dirección de Docker', restored.dockerUrl, 'http://100.64.0.1:2375')
  eq('pero no la contraseña de Docker', restored.dockerPassword, undefined)
  eq('restaura la dirección de casa de Docker', restored.dockerLanUrl, 'http://192.168.1.50:2375')
  eq('restaura el tema', restored.theme, 'dark')
  eq('restaura la velocidad contratada', `${restored.contractDownMbps}/${restored.contractUpMbps}`, '600/600')
  eq('restaura la ciudad del tiempo con sus coordenadas', `${restored.weatherPlace} ${restored.weatherLat} ${restored.weatherLon}`, 'Bilbao 43.26271 -2.92528')
  eq('restaura la marca de importación del bot', restored.notesImportedAt, 1234)
  eq('la contraseña no aparece de la nada al restaurar', restored.nextcloudPassword, undefined)

  console.log('\nRestaurar encima no pisa la contraseña de este móvil')
  const c = await freshDb()
  await writeSettings(c, { ...(await readSettings(c)), nextcloudPassword: 'la-de-aqui' })
  await importBackup(c, json)
  eq('se conserva la contraseña local', (await readSettings(c)).nextcloudPassword, 'la-de-aqui')

  console.log('\nReemplazar y combinar')
  const d = await seed()
  // Sin `notes` ni `saved`: así se prueba que replace vacía también lo que la copia no trae.
  const { notes: _notes, saved: _saved, deviceNames: _dn, ...exportedCore } = exported
  const onlyOne: BackupFile = { ...exportedCore, carExpenses: [fuel], medicines: [daily], intakes: [taken[0]], listItems: [] }
  await importBackup(d, JSON.stringify(onlyOne), 'replace')
  eq('replace deja solo lo de la copia', (await exportAll(d)).carExpenses.length, 1)
  eq('replace vacía las listas', (await exportAll(d)).listItems.length, 0)
  eq('replace vacía las notas si la copia no trae', (await exportAll(d)).notes?.length, 0)
  eq('y los nombres de dispositivos', (await exportAll(d)).deviceNames?.length, 0)

  const e = await seed()
  const extra: CarExpense = { ...workshop, id: 'c9', description: 'ITV' }
  await importBackup(e, JSON.stringify({ ...onlyOne, carExpenses: [extra], medicines: [], intakes: [] }), 'merge')
  eq('merge añade sin borrar', (await exportAll(e)).carExpenses.length, 3)

  console.log('\nTomas huérfanas y duplicadas')
  const f = await freshDb()
  const orphan: MedicineIntake = { id: 'i9', medicineId: 'no-existe', date: '2026-10-01', takenAt: 1 }
  const sameDay: MedicineIntake = { id: 'i10', medicineId: 'm1', date: '2026-10-16', takenAt: 2 }
  const r = await importBackup(f, JSON.stringify({ ...exported, intakes: [...taken, orphan, sameDay] }))
  eq('descarta la toma de una medicina que no existe', r.discardedIntakes, 1)
  eq('la misma medicina el mismo día no entra dos veces', (await exportAll(f)).intakes.length, 3)

  const g = await seed()
  const rm = await importBackup(g, JSON.stringify({ ...onlyOne, medicines: [], intakes: [{ ...orphan, medicineId: 'm2' }] }), 'merge')
  eq('en merge vale una medicina que ya estaba en el móvil', rm.discardedIntakes, 0)

  console.log('\nUna copia de la v1 sigue entrando')
  const v1 = await freshDb()
  const { notes: _n, saved: _s, deviceNames: _d, ...v1Shape } = exported
  const v1Items = exported.listItems.map(({ forWhom: _f, imageUrl: _i, photo: _p, ...rest }) => rest)
  const r1 = await importBackup(v1, JSON.stringify({ ...v1Shape, schemaVersion: 1, listItems: v1Items }))
  eq('entran los elementos de la v1', r1.listItems, 4)
  eq('sin notas en una copia de la v1', r1.notes, 0)
  eq('y la base queda bien', (await exportAll(v1)).listItems.find((i) => i.id === 'l3')?.forWhom, undefined)

  console.log('\nLas fotos de la copia llegan a la parte nativa')
  const ph = await freshDb()
  const withPhotos = { ...exported, photos: [{ name: 'l4.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' }] }
  const rp = await importBackup(ph, JSON.stringify(withPhotos))
  eq('devuelve las fotos para escribirlas a fichero', rp.photos.map((p) => p.name).join(), 'l4.jpg')
  eq('una copia sin fotos devuelve la lista vacía', (await importBackup(await freshDb(), json)).photos.length, 0)

  console.log('\nLo que se tiene que rechazar')
  const h = await freshDb()
  const rejects = async (label: string, raw: string, match: RegExp) => {
    try {
      await importBackup(h, raw)
      check(label, false, 'no lanzó error')
    } catch (err) {
      check(label, match.test((err as Error).message), (err as Error).message)
    }
  }
  await rejects('JSON roto', '{no', /JSON válido/)
  await rejects('copia de otra app', JSON.stringify({ app: 'ludok-time', items: [] }), /no parece una copia/)
  await rejects('copia de una versión más nueva', JSON.stringify({ ...exported, schemaVersion: 99 }), /más nueva/)
  eq('tras rechazar no ha entrado nada', (await exportAll(h)).medicines.length, 0)

  console.log('\nVolumen: años de tomas')
  const v = await freshDb()
  const many: MedicineIntake[] = []
  for (let i = 0; i < 1500; i++) {
    const date = addDays('2022-01-01', i)
    many.push({ id: `a${i}`, medicineId: 'm1', date, takenAt: i })
    if (i % 2 === 0) many.push({ id: `b${i}`, medicineId: 'm2', date, takenAt: i })
  }
  const big = await importBackup(v, JSON.stringify({ ...exported, intakes: many }))
  eq('entran 2250 tomas troceadas', big.intakes, 2250)
  eq('y se leen todas', (await exportAll(v)).intakes.length, 2250)

  finish('verify:data')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
