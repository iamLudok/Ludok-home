// Importación única de los datos que guardaba el bot de Telegram en Nextcloud
// Notes. Aquí solo se interpreta el texto y se escribe en la base; la descarga
// de las notas vive en `notesImport.ts`, que usa la red.
//
// Los formatos son los que escribía el bot (Ludok-home/notes/*.py), línea a
// línea. Una línea que no se entiende NO aborta la importación: se cuenta y se
// enseña, para que se pueda revisar a mano, pero el resto entra.
import { medicines as medsTable, intakes as intakesTable, carExpenses as carTable, listItems as listTable } from './schema'
import { carExpenseToRow, intakeToRow, listItemToRow, medicineToRow } from './rows'
import { chunk } from './sqlHelpers'
import { newId } from './ids'
import { isValidDay, isValidTime, today } from './dates'
import { fuelTotalCents } from './car'
import { cleanTimes } from './medicines'
import { readSettings, writeSettings, type LudokDb } from './backupCore'
import type { CarExpense, ListItem, ListKind, Medicine, MedicineIntake } from '../types'

/** Títulos exactos de las notas del bot. */
export const NOTE_TITLES = {
  car: 'Gastos del coche',
  medicineConfig: 'Medicinas Config',
  medicineHistory: 'Medicinas',
  shopping: 'Lista de la compra',
  wishlist: 'Wishlist',
  gifts: 'Regalos',
} as const

export interface NoteContent {
  title: string
  content: string
}

export interface ParseIssue {
  note: string
  line: string
}

/* --- Coche: «fecha,gasolina,litros,precio,total» o «fecha,taller,desc,importe» */

export function parseCarNote(content: string, issues: ParseIssue[] = []): Omit<CarExpense, 'id' | 'createdAt'>[] {
  const out: Omit<CarExpense, 'id' | 'createdAt'>[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(',')
    const [date, kind] = parts
    const bad = () => issues.push({ note: NOTE_TITLES.car, line })
    if (!isValidDay(date ?? '')) {
      bad()
      continue
    }
    if (kind === 'gasolina' && parts.length >= 5) {
      const liters = Number(parts[2])
      const price = Number(parts[3])
      const total = Number(parts[4])
      if (!(liters > 0) || !(price > 0)) {
        bad()
        continue
      }
      out.push({
        date,
        kind: 'gasolina',
        liters,
        pricePerLiter: price,
        // El total que guardó el bot manda: es lo que se pagó. Solo si falta
        // o está roto se recalcula.
        totalCents: total > 0 ? Math.round(total * 100) : fuelTotalCents(liters, price),
      })
    } else if ((kind === 'taller' || kind === 'recambio') && parts.length >= 4) {
      // La descripción puede llevar comas: el importe es siempre el último
      // campo y la descripción todo lo de en medio (igual que en car.py).
      const total = Number(parts[parts.length - 1])
      const description = parts.slice(2, -1).join(',').trim()
      if (!(total > 0) || !description) {
        bad()
        continue
      }
      out.push({ date, kind, description, totalCents: Math.round(total * 100) })
    } else {
      bad()
    }
  }
  return out
}

/* --- Medicinas: config «nombre,cada_dias,hora,aviso1,...» e historial «fecha,med1,med2» */

export interface ConfigMedicine {
  name: string
  everyDays: number
  time: string
  reminders: string[]
}

export function parseMedicineConfig(content: string, issues: ParseIssue[] = []): ConfigMedicine[] {
  const out: ConfigMedicine[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(',').map((p) => p.trim())
    const everyDays = Number(parts[1])
    if (parts.length < 3 || !parts[0] || !Number.isInteger(everyDays) || everyDays < 1 || !isValidTime(parts[2])) {
      issues.push({ note: NOTE_TITLES.medicineConfig, line })
      continue
    }
    out.push({
      name: parts[0],
      everyDays,
      time: parts[2],
      reminders: cleanTimes(parts.slice(3).filter(isValidTime)),
    })
  }
  return out
}

export function parseMedicineHistory(content: string, issues: ParseIssue[] = []): { date: string; names: string[] }[] {
  const out: { date: string; names: string[] }[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const [date, ...names] = line.split(',').map((p) => p.trim())
    if (!isValidDay(date)) {
      issues.push({ note: NOTE_TITLES.medicineHistory, line })
      continue
    }
    out.push({ date, names: names.filter(Boolean) })
  }
  return out
}

/* --- Listas: compra «- artículo»; wishlist y regalos, JSON [{nombre, url}] */

export function parseShopping(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim().replace(/^-\s*/, '').trim())
    .filter(Boolean)
}

export function parseJsonList(content: string, note: string, issues: ParseIssue[] = []): { name: string; url?: string }[] {
  let data: unknown
  try {
    data = JSON.parse(content || '[]')
  } catch {
    if (content.trim()) issues.push({ note, line: 'La nota no es un JSON válido.' })
    return []
  }
  if (!Array.isArray(data)) return []
  const out: { name: string; url?: string }[] = []
  for (const entry of data) {
    const name = typeof entry?.nombre === 'string' ? entry.nombre.trim() : ''
    if (!name) {
      issues.push({ note, line: JSON.stringify(entry) })
      continue
    }
    const url = typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : undefined
    out.push({ name, url })
  }
  return out
}

/* --- Aplicar ------------------------------------------------------------- */

export interface NotesImportResult {
  carExpenses: number
  medicines: number
  /** Medicinas que solo salen en el historial: entran desactivadas. */
  inactiveMedicines: string[]
  intakes: number
  listItems: number
  /** Notas que no estaban en Nextcloud. */
  missingNotes: string[]
  issues: ParseIssue[]
}

/**
 * Mete en la base todo lo que había en las notas, en una sola transacción.
 *
 * Se niega si ya se importó una vez: la importación AÑADE (no sustituye), y
 * repetirla duplicaría cada gasto y cada elemento de las listas.
 */
export async function applyNotesImport(
  database: LudokDb,
  notes: NoteContent[],
  now = Date.now(),
): Promise<NotesImportResult> {
  const settings = await readSettings(database)
  if (settings.notesImportedAt) {
    throw new Error('Los datos del bot ya se importaron. Repetirlo duplicaría todo.')
  }

  const byTitle = new Map(notes.map((n) => [n.title, n.content]))
  const missingNotes = Object.values(NOTE_TITLES).filter((t) => !byTitle.has(t))
  const issues: ParseIssue[] = []
  const get = (title: string) => byTitle.get(title) ?? ''

  const car: CarExpense[] = parseCarNote(get(NOTE_TITLES.car), issues).map((e) => ({
    ...e,
    id: newId(),
    createdAt: now,
  }))

  const config = parseMedicineConfig(get(NOTE_TITLES.medicineConfig), issues)
  const history = parseMedicineHistory(get(NOTE_TITLES.medicineHistory), issues)

  // Primera vez que aparece cada medicina en el historial: es su fecha de
  // inicio. Sin esto, una medicina de toda la vida contaría como olvidada todos
  // los días anteriores al de hoy en el gráfico de adherencia.
  const firstSeen = new Map<string, string>()
  for (const { date, names } of history) {
    for (const name of names) {
      const key = name.toLowerCase()
      const prev = firstSeen.get(key)
      if (!prev || date < prev) firstSeen.set(key, date)
    }
  }

  const meds: Medicine[] = []
  const medByName = new Map<string, Medicine>()
  for (const c of config) {
    const key = c.name.toLowerCase()
    if (medByName.has(key)) continue
    const med: Medicine = {
      id: newId(),
      name: c.name,
      everyDays: c.everyDays,
      time: c.time,
      reminders: c.reminders,
      startDate: firstSeen.get(key) ?? today(new Date(now)),
      active: true,
      createdAt: now,
    }
    meds.push(med)
    medByName.set(key, med)
  }

  // Las que ya no están en la pauta (Relvar, Rolufta…) entran desactivadas
  // para que su historial no se pierda.
  const inactiveMedicines: string[] = []
  for (const { names } of history) {
    for (const name of names) {
      const key = name.toLowerCase()
      if (medByName.has(key)) continue
      const med: Medicine = {
        id: newId(),
        name,
        everyDays: 1,
        time: '08:00',
        reminders: [],
        startDate: firstSeen.get(key)!,
        active: false,
        createdAt: now,
      }
      meds.push(med)
      medByName.set(key, med)
      inactiveMedicines.push(name)
    }
  }

  const seen = new Set<string>()
  const taken: MedicineIntake[] = []
  for (const { date, names } of history) {
    for (const name of names) {
      const med = medByName.get(name.toLowerCase())!
      const key = `${med.id}|${date}`
      if (seen.has(key)) continue
      seen.add(key)
      taken.push({ id: newId(), medicineId: med.id, date, takenAt: now })
    }
  }

  const items: ListItem[] = []
  const pushItems = (list: ListKind, entries: { name: string; url?: string }[]) => {
    entries.forEach((e, index) => {
      // createdAt escalonado para que el orden de la lista sea el de la nota.
      items.push({ id: newId(), list, name: e.name, url: e.url, done: false, createdAt: now + index })
    })
  }
  pushItems('compra', parseShopping(get(NOTE_TITLES.shopping)).map((name) => ({ name })))
  pushItems('wishlist', parseJsonList(get(NOTE_TITLES.wishlist), NOTE_TITLES.wishlist, issues))
  pushItems('regalos', parseJsonList(get(NOTE_TITLES.gifts), NOTE_TITLES.gifts, issues))

  await database.transaction(async (tx: LudokDb) => {
    for (const part of chunk(car)) await tx.insert(carTable).values(part.map(carExpenseToRow))
    for (const part of chunk(meds)) await tx.insert(medsTable).values(part.map(medicineToRow))
    for (const part of chunk(taken)) await tx.insert(intakesTable).values(part.map(intakeToRow))
    for (const part of chunk(items)) await tx.insert(listTable).values(part.map(listItemToRow))
  })
  await writeSettings(database, { ...(await readSettings(database)), notesImportedAt: now })

  return {
    carExpenses: car.length,
    medicines: meds.length - inactiveMedicines.length,
    inactiveMedicines,
    intakes: taken.length,
    listItems: items.length,
    missingNotes,
    issues,
  }
}
