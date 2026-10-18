// Medicinas: pauta, tomas, qué toca hoy, avisos y adherencia.
//
// La regla de cuándo toca vive en funciones puras que reciben las tomas por
// parámetro. Así la pantalla de hoy, el gráfico de adherencia y la
// programación de avisos usan la misma regla a la fuerza, y `verify/` la prueba
// sin base de datos.
//
// LA REGLA: una medicina de cada N días toca cuando han pasado al menos N días
// desde la última toma, y SIGUE tocando hasta que se toma. El bot de Telegram
// lo hacía con «días desde la última toma múltiplo de N», y eso tenía un hueco:
// si te olvidabas FML el día que tocaba, al día siguiente ya no tocaba y no te
// enterabas hasta el otro.
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from './dbRef'
import { medicines as medsTable, intakes as intakesTable } from './schema'
import { medicineToRow, rowToIntake, rowToMedicine } from './rows'
import { patchToColumns } from './sqlHelpers'
import { newId } from './ids'
import { addDays, atTime, daysBetween, diffDays, isValidDay, isValidTime, today } from './dates'
import type { DayString, Medicine, MedicineIntake, TimeString } from '../types'

/* --- La regla ------------------------------------------------------------ */

/** Última toma de la medicina ANTES de `day` (sin contar ese día). */
export function lastIntakeBefore(
  medicineId: string,
  intakes: MedicineIntake[],
  day: DayString,
): DayString | undefined {
  let last: DayString | undefined
  for (const i of intakes) {
    if (i.medicineId !== medicineId || i.date >= day) continue
    if (!last || i.date > last) last = i.date
  }
  return last
}

function dueGivenLast(med: Medicine, last: DayString | undefined, day: DayString): boolean {
  if (day < med.startDate) return false
  if (med.everyDays <= 1 || !last) return true
  return diffDays(last, day) >= med.everyDays
}

/** Si a la medicina le toca ese día (tomada o no), mirando solo las tomas anteriores. */
export function isDue(med: Medicine, intakes: MedicineIntake[], day: DayString): boolean {
  if (!med.active) return false
  return dueGivenLast(med, lastIntakeBefore(med.id, intakes, day), day)
}

export function takenOn(medicineId: string, intakes: MedicineIntake[], day: DayString): boolean {
  return intakes.some((i) => i.medicineId === medicineId && i.date === day)
}

export interface TodayMedicine {
  medicine: Medicine
  taken: boolean
}

/** Las medicinas que tocan `day`, con si ya están tomadas, ordenadas por hora. */
export function medicinesForDay(
  meds: Medicine[],
  intakes: MedicineIntake[],
  day: DayString,
): TodayMedicine[] {
  return meds
    .filter((m) => isDue(m, intakes, day))
    .map((m) => ({ medicine: m, taken: takenOn(m.id, intakes, day) }))
    .sort((a, b) => a.medicine.time.localeCompare(b.medicine.time) || a.medicine.name.localeCompare(b.medicine.name))
}

/**
 * Próximos días en que tocará, desde `from` (incluido) durante `horizon` días.
 *
 * Supone que cada día que toque se tomará: es lo que hace falta para programar
 * avisos por adelantado. Si luego no se toma, al abrir la app se reprograma y
 * el día siguiente pasa a tocar también.
 */
export function plannedDays(
  med: Medicine,
  intakes: MedicineIntake[],
  from: DayString,
  horizon: number,
): DayString[] {
  if (!med.active) return []
  const out: DayString[] = []
  let last = lastIntakeBefore(med.id, intakes, from)
  for (const day of daysBetween(from, addDays(from, horizon - 1))) {
    if (takenOn(med.id, intakes, day)) {
      last = day
      continue
    }
    if (dueGivenLast(med, last, day)) {
      out.push(day)
      last = day
    }
  }
  return out
}

/* --- Avisos -------------------------------------------------------------- */

export interface PlannedReminder {
  medicineId: string
  medicineName: string
  day: DayString
  at: Date
  /** La primera a la hora de la toma; las demás, de repaso. */
  kind: 'toma' | 'repaso'
}

/** Cuántos días por delante se programan. Ver `notifications.ts`. */
export const REMINDER_HORIZON_DAYS = 14

/**
 * Todos los avisos que deberían estar programados ahora mismo: solo los
 * futuros, y ninguno de un día en que la medicina ya está tomada.
 */
export function reminderPlan(
  meds: Medicine[],
  intakes: MedicineIntake[],
  now = new Date(),
  horizon = REMINDER_HORIZON_DAYS,
): PlannedReminder[] {
  const from = today(now)
  const out: PlannedReminder[] = []
  for (const med of meds) {
    const times: TimeString[] = [med.time, ...med.reminders.filter((t) => t !== med.time)]
    for (const day of plannedDays(med, intakes, from, horizon)) {
      times.forEach((time, index) => {
        const at = atTime(day, time)
        if (at.getTime() <= now.getTime()) return
        out.push({
          medicineId: med.id,
          medicineName: med.name,
          day,
          at,
          kind: index === 0 ? 'toma' : 'repaso',
        })
      })
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

/* --- Adherencia ---------------------------------------------------------- */

export type DayState = 'tomada' | 'olvidada' | 'pendiente' | 'nada'

export interface AdherenceRow {
  medicine: Medicine
  days: { day: DayString; state: DayState }[]
  /** Porcentaje de días que tocaba en que se tomó. null si no tocó ninguno. */
  percent: number | null
}

/**
 * Estado de cada medicina en cada día de [from, to].
 *
 * Una medicina desactivada sigue saliendo los días en que se tomó, pero no
 * cuenta como olvidada: dejarla de tomar fue una decisión, no un descuido.
 */
export function adherence(
  meds: Medicine[],
  intakes: MedicineIntake[],
  from: DayString,
  to: DayString,
  todayDay: DayString = today(),
): AdherenceRow[] {
  const days = daysBetween(from, to)
  const rows: AdherenceRow[] = []
  for (const med of meds) {
    const own = intakes.filter((i) => i.medicineId === med.id)
    if (!med.active && !own.some((i) => i.date >= from && i.date <= to)) continue
    let taken = 0
    let missed = 0
    const cells = days.map((day) => {
      let state: DayState
      if (takenOn(med.id, own, day)) state = 'tomada'
      else if (!med.active || !dueGivenLast(med, lastIntakeBefore(med.id, own, day), day)) state = 'nada'
      else if (day === todayDay) state = 'pendiente'
      else if (day > todayDay) state = 'nada'
      else state = 'olvidada'
      if (state === 'tomada') taken++
      if (state === 'olvidada') missed++
      return { day, state }
    })
    rows.push({
      medicine: med,
      days: cells,
      percent: taken + missed > 0 ? Math.round((100 * taken) / (taken + missed)) : null,
    })
  }
  return rows
}

/* --- Escritura ----------------------------------------------------------- */

export interface MedicineInput {
  name: string
  everyDays: number
  time: TimeString
  reminders: TimeString[]
  startDate?: DayString
}

function validate(input: Partial<MedicineInput>): void {
  if (input.name !== undefined && !input.name.trim()) throw new Error('Falta el nombre.')
  if (input.everyDays !== undefined && (!Number.isInteger(input.everyDays) || input.everyDays < 1)) {
    throw new Error('«Cada cuántos días» tiene que ser un número entero desde 1.')
  }
  if (input.time !== undefined && !isValidTime(input.time)) throw new Error('Hora no válida (HH:MM).')
  if (input.reminders?.some((t) => !isValidTime(t))) throw new Error('Algún aviso tiene una hora no válida.')
  if (input.startDate !== undefined && !isValidDay(input.startDate)) throw new Error('Fecha de inicio no válida.')
}

/** Ordena y quita duplicados: «13:00, 09:30, 13:00» → «09:30, 13:00». */
export function cleanTimes(times: TimeString[]): TimeString[] {
  return [...new Set(times.map((t) => t.trim()).filter(Boolean))].sort()
}

export async function addMedicine(input: MedicineInput): Promise<Medicine> {
  validate(input)
  const med: Medicine = {
    id: newId(),
    name: input.name.trim(),
    everyDays: input.everyDays,
    time: input.time,
    reminders: cleanTimes(input.reminders),
    startDate: input.startDate ?? today(),
    active: true,
    createdAt: Date.now(),
  }
  await getDb().insert(medsTable).values(medicineToRow(med))
  return med
}

export async function updateMedicine(
  id: string,
  patch: Partial<MedicineInput> & { active?: boolean },
): Promise<void> {
  validate(patch)
  const { name, reminders, ...rest } = patch
  const cols = patchToColumns(rest)
  if (name !== undefined) cols.name = name.trim()
  // Los avisos van como JSON en una sola columna (ver schema.ts).
  if (reminders !== undefined) cols.reminders = JSON.stringify(cleanTimes(reminders))
  await getDb().update(medsTable).set(cols).where(eq(medsTable.id, id))
}

/** Borra la medicina Y su historial. Para dejar de tomarla, mejor `active: false`. */
export async function deleteMedicine(id: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(intakesTable).where(eq(intakesTable.medicineId, id))
    await tx.delete(medsTable).where(eq(medsTable.id, id))
  })
}

/**
 * Empezar de cero: borra todas las tomas de la medicina y la cuenta desde
 * `day`. Para cuando cambia el tratamiento y el historial anterior ya no dice
 * nada (y en el gráfico solo saldría como olvidos que no lo fueron).
 */
export async function resetHistory(id: string, day: DayString = today()): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(intakesTable).where(eq(intakesTable.medicineId, id))
    await tx.update(medsTable).set({ startDate: day }).where(eq(medsTable.id, id))
  })
}

/** Marca la toma. Devuelve false si ya estaba marcada ese día. */
export async function markTaken(medicineId: string, day: DayString = today()): Promise<boolean> {
  const res = await getDb()
    .insert(intakesTable)
    .values({ id: newId(), medicineId, date: day, takenAt: Date.now() })
    .onConflictDoNothing()
    .returning({ id: intakesTable.id })
  return res.length > 0
}

export async function unmarkTaken(medicineId: string, day: DayString = today()): Promise<void> {
  await getDb()
    .delete(intakesTable)
    .where(and(eq(intakesTable.medicineId, medicineId), eq(intakesTable.date, day)))
}

export async function listMedicines(): Promise<Medicine[]> {
  const rows = await getDb().select().from(medsTable).orderBy(asc(medsTable.time), asc(medsTable.name))
  return rows.map(rowToMedicine)
}

/**
 * Todas las tomas. Sin filtro por fecha a propósito: para saber si hoy toca una
 * medicina de cada N días hace falta la última toma, que puede ser de hace
 * semanas si llevas tiempo sin tomarla. Son dos o tres filas al día; años de
 * historial caben de sobra en memoria.
 */
export async function listIntakes(): Promise<MedicineIntake[]> {
  const rows = await getDb().select().from(intakesTable)
  return rows.map(rowToIntake)
}
