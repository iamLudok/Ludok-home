/**
 * Las reglas del dominio, una a una, con el mismo código que corre en el móvil.
 *
 * Lo que más importa aquí es la regla de las medicinas: de ella salen la
 * pantalla de hoy, los avisos y el gráfico de adherencia. Un fallo en ella es
 * un aviso que no llega o una toma que se cuenta como olvidada.
 */
import { check, eq, finish, freshDbAsCurrent } from './harness'
import { addDays, atTime, daysBetween, diffDays, isValidDay, isValidTime, lastMonths } from '../src/lib/dates'
import { formatDecimal, formatEuros, parseDecimal, parseEuros } from '../src/lib/money'
import {
  addFuel,
  addOther,
  averageConsumption,
  averagePricePerLiter,
  deleteExpense,
  fuelTotalCents,
  listExpenses,
  monthlyTotals,
  updateExpense,
} from '../src/lib/car'
import {
  addMedicine,
  adherence,
  deleteMedicine,
  isDue,
  listIntakes,
  listMedicines,
  markTaken,
  medicinesForDay,
  plannedDays,
  reminderPlan,
  unmarkTaken,
  updateMedicine,
} from '../src/lib/medicines'
import { newsReminderTime } from '../src/lib/newsReminder'
import { addItem, clearAll, cleanUrl, clearDone, giftsByPerson, listItems, NO_ONE, removeItem, setDone, shareText, updateItem } from '../src/lib/lists'
import { addNote, listNotes, notesForToday, notesInMind, setNoteDone } from '../src/lib/notes'
import { addSaved, filterSaved, listSaved, normalizeTags, setSavedDone, tagCounts, updateSaved } from '../src/lib/saved'
import { listIntakes as allIntakes, resetHistory } from '../src/lib/medicines'
import type { Medicine, MedicineIntake } from '../src/types'

async function throws(label: string, fn: () => Promise<unknown>, match: RegExp) {
  try {
    await fn()
    check(label, false, 'no lanzó error')
  } catch (err) {
    check(label, match.test((err as Error).message), (err as Error).message)
  }
}

const med = (over: Partial<Medicine>): Medicine => ({
  id: 'm', name: 'M', everyDays: 1, time: '08:00', reminders: [],
  startDate: '2026-01-01', active: true, createdAt: 0, ...over,
})
const took = (medicineId: string, ...dates: string[]): MedicineIntake[] =>
  dates.map((date, i) => ({ id: `${medicineId}-${date}-${i}`, medicineId, date, takenAt: 0 }))

function datesRules() {
  console.log('Fechas')
  // 29 de marzo de 2026: cambio de hora en España. Un día de 23 horas.
  eq('sumar un día cruzando el cambio de hora', addDays('2026-03-28', 2), '2026-03-30')
  eq('días entre fechas a través del cambio de hora', diffDays('2026-03-28', '2026-03-31'), 3)
  eq('fin de mes', addDays('2026-01-31', 1), '2026-02-01')
  eq('año bisiesto', addDays('2028-02-28', 1), '2028-02-29')
  eq('restar días', addDays('2026-01-01', -1), '2025-12-31')
  eq('rango de días incluye los dos extremos', daysBetween('2026-10-15', '2026-10-17').join(), '2026-10-15,2026-10-16,2026-10-17')
  check('30 de febrero no es una fecha', !isValidDay('2026-02-30'))
  check('fecha bien formada', isValidDay('2026-10-17'))
  check('25:00 no es una hora', !isValidTime('25:00'))
  check('hora sin cero delante no vale', !isValidTime('8:00'))
  eq('las 08:30 del día, en hora local', atTime('2026-10-17', '08:30').getHours(), 8)
  eq('últimos 3 meses en orden', lastMonths(3, new Date(2026, 0, 15)).join(), '2025-11,2025-12,2026-01')
}

function moneyRules() {
  console.log('\nDinero')
  eq('«40» son 4000 céntimos', parseEuros('40'), 4000)
  eq('coma decimal', parseEuros('40,5'), 4050)
  eq('punto decimal (teclado numérico)', parseEuros('40.50'), 4050)
  eq('miles con punto y decimales con coma', parseEuros('1.234,56'), 123456)
  eq('miles con coma y decimales con punto', parseEuros('1,234.56'), 123456)
  eq('con símbolo y espacios', parseEuros(' 12,30 € '), 1230)
  eq('cero no es un importe', parseEuros('0'), null)
  eq('texto no es un importe', parseEuros('abc'), null)
  eq('negativo no es un importe', parseEuros('-5'), null)
  eq('el precio por litro conserva tres decimales', parseDecimal('1,659'), 1.659)
  eq('formato con miles', formatEuros(123456), '1.234,56 €')
  eq('formato de céntimos sueltos', formatEuros(5), '0,05 €')
  eq('decimales sin ceros sobrantes', formatDecimal(40), '40')
  eq('decimales con coma', formatDecimal(1.659, 3), '1,659')
}

async function carRules() {
  console.log('\nCoche')
  await freshDbAsCurrent()
  eq('total de un repostaje', fuelTotalCents(40, 1.659), 6636)
  const f1 = await addFuel({ date: '2026-09-01', liters: 40, pricePerLiter: 1.659, odometerKm: 100000 })
  eq('el total se calcula si no se da', f1.totalCents, 6636)
  const f2 = await addFuel({ date: '2026-09-20', liters: 35, pricePerLiter: 1.6, totalCents: 5599, odometerKm: 100700 })
  eq('el total del ticket manda si se da', f2.totalCents, 5599)
  await addOther({ date: '2026-10-02', kind: 'taller', description: '  Revisión  ', totalCents: 12000 })
  await addOther({ date: '2026-10-05', kind: 'recambio', description: 'Escobillas', totalCents: 1999 })
  await throws('taller sin descripción', () => addOther({ date: '2026-10-05', kind: 'taller', description: ' ', totalCents: 100 }), /descripción/)
  await throws('repostaje sin litros', () => addFuel({ date: '2026-10-05', liters: 0, pricePerLiter: 1.6 }), /litros/)
  await throws('fecha imposible', () => addOther({ date: '2026-13-01', kind: 'taller', description: 'x', totalCents: 1 }), /Fecha/)

  const all = await listExpenses()
  eq('lista ordenada de más nuevo a más viejo', all[0].date, '2026-10-05')
  eq('la descripción se guarda sin espacios sobrantes', all.find((e) => e.kind === 'taller')?.description, 'Revisión')

  const months = monthlyTotals(all, ['2026-08', '2026-09', '2026-10'])
  eq('un mes sin gastos sale a cero', months[0].total, 0)
  eq('gasolina de septiembre', months[1].gasolina, 6636 + 5599)
  eq('litros de septiembre', months[1].liters, 75)
  eq('taller de octubre', months[2].taller, 12000)
  eq('total de octubre', months[2].total, 13999)

  // 700 km con los 35 L del segundo repostaje: 5 L/100 km.
  eq('consumo por depósito lleno', averageConsumption(all), 5)
  eq('sin dos repostajes con km no hay consumo', averageConsumption([f1]), null)
  const avg = averagePricePerLiter(all)!
  check('precio medio ponderado por litros', Math.abs(avg - (6636 + 5599) / 100 / 75) < 1e-9, String(avg))

  await updateExpense(f1.id, { odometerKm: undefined })
  eq('vaciar un campo con undefined', (await listExpenses()).find((e) => e.id === f1.id)?.odometerKm, undefined)
  await deleteExpense(f1.id)
  eq('borrar un gasto', (await listExpenses()).length, 3)
}

async function medicineRules() {
  console.log('\nMedicinas: cuándo toca')
  const daily = med({ id: 'd', everyDays: 1 })
  const fml = med({ id: 'f', everyDays: 2, startDate: '2026-10-01' })

  check('una diaria toca cualquier día', isDue(daily, [], '2026-10-17'))
  check('antes de su fecha de inicio no toca', !isDue(fml, [], '2026-09-30'))
  check('sin ninguna toma, toca', isDue(fml, [], '2026-10-01'))
  const fmlTaken = took('f', '2026-10-15')
  check('cada 48 h: el día siguiente no toca', !isDue(fml, fmlTaken, '2026-10-16'))
  check('cada 48 h: a los dos días toca', isDue(fml, fmlTaken, '2026-10-17'))
  check('si se olvida, al día siguiente SIGUE tocando', isDue(fml, fmlTaken, '2026-10-18'))
  check('el día en que se tomó cuenta como que tocaba', isDue(fml, fmlTaken, '2026-10-15'))
  check('desactivada no toca nunca', !isDue(med({ active: false }), [], '2026-10-17'))

  const listForDay = medicinesForDay(
    [med({ id: 'b', name: 'B', time: '21:00' }), med({ id: 'a', name: 'A', time: '08:00' }), fml],
    [...took('a', '2026-10-16'), ...took('f', '2026-10-16')],
    '2026-10-16',
  )
  eq('las de hoy salen ordenadas por hora', listForDay.map((t) => t.medicine.id).join(), 'a,f,b')
  eq('con su estado de tomada', listForDay.map((t) => t.taken).join(), 'true,true,false')

  eq('días planeados cada 48 h', plannedDays(fml, fmlTaken, '2026-10-16', 6).join(), '2026-10-17,2026-10-19,2026-10-21')
  eq('si hoy ya está tomada, el plan empieza después', plannedDays(fml, took('f', '2026-10-16'), '2026-10-16', 4).join(), '2026-10-18')
  eq('si se olvidó, el plan empieza hoy', plannedDays(fml, fmlTaken, '2026-10-18', 3).join(), '2026-10-18,2026-10-20')

  console.log('\nMedicinas: avisos')
  const elebrato = med({ id: 'e', name: 'Elebrato', time: '08:00', reminders: ['13:00', '09:30', '08:00'] })
  const at1000 = new Date(2026, 9, 17, 10, 0)
  const plan = reminderPlan([elebrato], [], at1000, 2)
  eq('hoy solo quedan los avisos futuros', plan.filter((p) => p.day === '2026-10-17').map((p) => p.at.getHours()).join(), '13')
  eq('mañana: toma y dos repasos, sin repetir las 08:00', plan.filter((p) => p.day === '2026-10-18').length, 3)
  eq('el primero de cada día es el de la toma', plan.find((p) => p.day === '2026-10-18')?.kind, 'toma')
  const planTaken = reminderPlan([elebrato], took('e', '2026-10-17'), at1000, 2)
  check('tomada hoy: ningún aviso hoy', !planTaken.some((p) => p.day === '2026-10-17'))
  eq('desactivada: ningún aviso', reminderPlan([med({ active: false })], [], at1000, 3).length, 0)
  const planSorted = reminderPlan([elebrato, med({ id: 'g', name: 'G', time: '07:00' })], [], at1000, 2)
  check('los avisos van en orden de hora', planSorted.every((p, i) => i === 0 || planSorted[i - 1].at <= p.at))

  console.log('\nMedicinas: adherencia')
  const rows = adherence(
    [daily, fml, med({ id: 'old', active: false })],
    [...took('d', '2026-10-14', '2026-10-16'), ...took('f', '2026-10-14')],
    '2026-10-14',
    '2026-10-17',
    '2026-10-17',
  )
  const states = (id: string) => rows.find((r) => r.medicine.id === id)!.days.map((d) => d.state).join()
  eq('diaria: tomada, olvidada, tomada, pendiente hoy', states('d'), 'tomada,olvidada,tomada,pendiente')
  eq('porcentaje de la diaria (2 de 3)', rows.find((r) => r.medicine.id === 'd')!.percent, 67)
  eq('cada 48 h: el día de descanso no cuenta', states('f'), 'tomada,nada,olvidada,pendiente')
  check('una desactivada sin tomas en el rango no sale', !rows.some((r) => r.medicine.id === 'old'))
  const withOld = adherence([med({ id: 'old', active: false })], took('old', '2026-10-15'), '2026-10-14', '2026-10-16', '2026-10-17')
  eq('una desactivada sale sus días tomados y no cuenta olvidos', withOld[0].days.map((d) => d.state).join(), 'nada,tomada,nada')
  const beforeStart = adherence([med({ id: 'n', startDate: '2026-10-16' })], [], '2026-10-14', '2026-10-16', '2026-10-17')
  eq('antes del inicio no hay olvidos', beforeStart[0].days.map((d) => d.state).join(), 'nada,nada,olvidada')

  console.log('\nMedicinas: escritura')
  await freshDbAsCurrent()
  const m = await addMedicine({ name: ' Elebrato ', everyDays: 1, time: '08:00', reminders: ['13:00', '09:30', '13:00'] })
  eq('el nombre se guarda limpio', m.name, 'Elebrato')
  eq('los avisos se ordenan y no se repiten', m.reminders.join(), '09:30,13:00')
  check('marcar una toma', await markTaken(m.id, '2026-10-17'))
  check('marcarla otra vez el mismo día no duplica', !(await markTaken(m.id, '2026-10-17')))
  eq('una sola toma', (await listIntakes()).length, 1)
  await unmarkTaken(m.id, '2026-10-17')
  eq('desmarcar la quita', (await listIntakes()).length, 0)
  await updateMedicine(m.id, { reminders: ['22:00', '21:30'], active: false })
  const updated = (await listMedicines())[0]
  eq('editar avisos', updated.reminders.join(), '21:30,22:00')
  eq('desactivar', updated.active, false)
  await throws('cada 0 días no vale', () => addMedicine({ name: 'X', everyDays: 0, time: '08:00', reminders: [] }), /entero/)
  await throws('hora mal escrita', () => addMedicine({ name: 'X', everyDays: 1, time: '8h', reminders: [] }), /Hora/)
  await markTaken(m.id, '2026-10-16')
  await deleteMedicine(m.id)
  eq('borrar una medicina borra también sus tomas', (await listIntakes()).length, 0)
}

async function listRules() {
  console.log('\nListas')
  await freshDbAsCurrent()
  const leche = await addItem('compra', ' Leche ')
  check('añadir', leche?.name === 'Leche')
  eq('no se duplica un pendiente con el mismo nombre', await addItem('compra', 'leche'), null)
  check('pero sí en otra lista', (await addItem('regalos', 'Leche')) !== null)
  await setDone(leche!.id, true)
  check('una vez comprada, se puede volver a apuntar', (await addItem('compra', 'Leche')) !== null)
  const compra = await listItems('compra')
  eq('los pendientes salen antes que los hechos', compra.map((i) => i.done).join(), 'false,true')
  eq('vaciar comprados borra solo los hechos', (await clearDone('compra')).length, 0)
  eq('quedan los pendientes', (await listItems('compra')).length, 1)
  await removeItem((await listItems('compra'))[0].id)
  eq('quitar un elemento', (await listItems('compra')).length, 0)
  eq('enlace sin esquema', cleanUrl('amazon.es/dp/123'), 'https://amazon.es/dp/123')
  eq('enlace vacío', cleanUrl('  '), undefined)
  await throws('un texto no es un enlace', () => addItem('wishlist', 'X', { url: 'no es un enlace' }), /dirección web/)

  console.log('\nListas: regalos, fotos, compartir y vaciar')
  await freshDbAsCurrent()
  await addItem('regalos', 'Libro', { forWhom: ' Laura ' })
  check('el mismo regalo para otra persona sí entra', (await addItem('regalos', 'libro', { forWhom: 'Pablo' })) !== null)
  eq('para la misma persona no se duplica', await addItem('regalos', 'Libro', { forWhom: 'laura' }), null)
  await addItem('regalos', 'Bufanda')
  const groups = giftsByPerson(await listItems('regalos'))
  eq('agrupados por persona, sin decidir al final', groups.map((g) => g.person).join(), `Laura,Pablo,${NO_ONE}`)
  eq('para quién se guarda sin espacios', (await listItems('regalos')).find((i) => i.forWhom === 'Laura')?.name, 'Libro')
  check('en la compra no se guarda para quién', (await addItem('compra', 'Pan', { forWhom: 'Laura' }))?.forWhom === undefined)
  const conFoto = await addItem('wishlist', 'Auriculares', { url: 'amazon.es/dp/B0CFPJYX7P', photo: 'a.jpg', imageUrl: 'https://img/x.jpg' })
  await updateItem(conFoto!.id, { photo: undefined })
  eq('quitar la foto con undefined', (await listItems('wishlist'))[0].photo, undefined)
  eq('sin tocar la imagen de vista previa', (await listItems('wishlist'))[0].imageUrl, 'https://img/x.jpg')
  await updateItem(conFoto!.id, { photo: 'b.jpg' })
  eq('quitar un elemento devuelve su foto para borrarla', await removeItem(conFoto!.id), 'b.jpg')

  await addItem('compra', 'Leche')
  const pan = (await listItems('compra')).find((i) => i.name === 'Pan')!
  await setDone(pan.id, true)
  eq('compartir solo lo que falta, en orden', shareText(await listItems('compra')), 'Lista de la compra:\n- Leche')
  eq('sin nada pendiente no hay texto que compartir', shareText([]), '')
  await clearAll('compra')
  eq('vaciar la lista entera', (await listItems('compra')).length, 0)
  eq('vaciar una lista no toca las demás', (await listItems('regalos')).length, 3)
}

async function noteRules() {
  console.log('\nNotas rápidas')
  await freshDbAsCurrent()
  const hoy = await addNote(' Llamar al taller ', '2026-10-18')
  await addNote('Comprar regalo de Laura', '2026-10-17')
  await addNote('Idea: app de recetas')
  await addNote('Para mañana', '2026-10-19')
  await throws('una nota vacía no vale', () => addNote('   '), /vacía/)
  const notes = await listNotes()
  eq('la de ayer sin hacer sigue saliendo hoy, y primero', notesForToday(notes, '2026-10-18').map((n) => n.text).join('|'), 'Comprar regalo de Laura|Llamar al taller')
  check('la de mañana no sale hoy', !notesForToday(notes, '2026-10-18').some((n) => n.text === 'Para mañana'))
  eq('las de tener en mente van aparte', notesInMind(notes).map((n) => n.text).join(), 'Idea: app de recetas')
  await setNoteDone(hoy.id, true)
  eq('hecha, desaparece de hoy', notesForToday(await listNotes(), '2026-10-18').length, 1)
}

async function savedRules() {
  console.log('\nGuardados')
  await freshDbAsCurrent()
  eq('etiquetas limpias y sin repetir', normalizeTags('Receta, comida  rápida ,receta, #App').join('|'), 'receta|comida rápida|app')
  const a = await addSaved({ url: 'https://www.instagram.com/reel/ABC123/?igsh=xyz&utm_source=ig', tags: 'receta' })
  eq('se guarda sin los parámetros de rastreo', a.link.url, 'https://www.instagram.com/reel/ABC123/')
  eq('un reel de Instagram es un vídeo', a.link.kind, 'video')
  const again = await addSaved({ url: 'https://www.instagram.com/reel/ABC123/?igsh=otro', tags: 'cena' })
  check('el mismo reel no se duplica', again.existed && (await listSaved()).length === 1)
  eq('pero suma las etiquetas nuevas', again.link.tags.join(), 'receta,cena')
  const web = await addSaved({ url: 'https://dribbble.com/shots/123', title: ' Portfolio chulo ', tags: ['portfolio', 'Diseño'] })
  eq('una web es web', web.link.kind, 'web')
  eq('el título se guarda limpio', web.link.title, 'Portfolio chulo')
  await throws('un texto no es un enlace', () => addSaved({ url: 'hola', tags: [] }), /enlace/)
  const all = await listSaved()
  eq('etiquetas más usadas primero', tagCounts(all).map((t) => t.tag).join(), 'cena,diseño,portfolio,receta')
  eq('filtrar por etiqueta', filterSaved(all, { tag: 'receta' }).length, 1)
  await setSavedDone(a.link.id, true)
  eq('lo hecho sale del filtro de pendientes', filterSaved(await listSaved(), {}).length, 1)
  eq('y está en el de hechos', filterSaved(await listSaved(), { done: true })[0].id, a.link.id)
  await updateSaved(web.link.id, { tags: 'web, Inspiración', note: '  ' })
  const edited = (await listSaved()).find((l) => l.id === web.link.id)!
  eq('editar etiquetas', edited.tags.join(), 'web,inspiración')
  eq('una nota en blanco se guarda vacía', edited.note, undefined)
}

async function resetRules() {
  console.log('\nMedicinas: empezar de cero')
  await freshDbAsCurrent()
  const m = await addMedicine({ name: 'FML gotas', everyDays: 2, time: '21:00', reminders: [], startDate: '2026-04-10' })
  await markTaken(m.id, '2026-10-15')
  await markTaken(m.id, '2026-10-17')
  await resetHistory(m.id, '2026-10-18')
  eq('se borran sus tomas', (await allIntakes()).length, 0)
  const reset = (await listMedicines())[0]
  eq('empieza a contar desde hoy', reset.startDate, '2026-10-18')
  check('y hoy le toca, aunque la última toma fuera anteayer', isDue(reset, [], '2026-10-18'))
  check('ayer no cuenta como olvidada', adherence([reset], [], '2026-10-17', '2026-10-18', '2026-10-18')[0].days[0].state === 'nada')
}

function newsReminderRules() {
  console.log('\nAviso de las noticias')
  eq('sin ajuste, antes de salir de casa', newsReminderTime({}), '06:15')
  eq('a la hora elegida', newsReminderTime({ newsReminder: '07:45' }), '07:45')
  eq('apagado', newsReminderTime({ newsReminder: 'off' }), null)
  eq('un valor raro cuenta como la hora por defecto, no como apagado', newsReminderTime({ newsReminder: 'mañana' }), '06:15')
}

async function main() {
  datesRules()
  newsReminderRules()
  moneyRules()
  await carRules()
  await medicineRules()
  await listRules()
  await noteRules()
  await savedRules()
  await resetRules()
  finish('verify:library')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
