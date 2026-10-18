// Gastos del coche: repostajes, taller y recambios.
//
// Las funciones puras (totales por mes, consumo) van separadas de las que
// escriben en la base para que las pantallas y `verify/` usen exactamente las
// mismas cuentas.
import { desc, eq } from 'drizzle-orm'
import { getDb } from './dbRef'
import { carExpenses as carTable } from './schema'
import { carExpenseToRow, rowToCarExpense } from './rows'
import { patchToColumns } from './sqlHelpers'
import { newId } from './ids'
import { isValidDay, monthOf } from './dates'
import type { CarExpense, CarExpenseKind, DayString } from '../types'

export const KINDS: CarExpenseKind[] = ['gasolina', 'taller', 'recambio']

export const KIND_LABEL: Record<CarExpenseKind, string> = {
  gasolina: 'Gasolina',
  taller: 'Taller',
  recambio: 'Recambios',
}

/** Total de un repostaje en céntimos. */
export function fuelTotalCents(liters: number, pricePerLiter: number): number {
  return Math.round(liters * pricePerLiter * 100)
}

export interface FuelInput {
  date: DayString
  liters: number
  pricePerLiter: number
  /**
   * Lo que marca el ticket, si se quiere apuntar tal cual. Si falta se calcula
   * con litros × precio, que es lo que hacía el bot.
   */
  totalCents?: number
  odometerKm?: number
}

export interface OtherInput {
  date: DayString
  kind: 'taller' | 'recambio'
  description: string
  totalCents: number
}

function check(cond: boolean, message: string): void {
  if (!cond) throw new Error(message)
}

export async function addFuel(input: FuelInput): Promise<CarExpense> {
  check(isValidDay(input.date), 'Fecha no válida.')
  check(input.liters > 0, 'Los litros tienen que ser mayores que cero.')
  check(input.pricePerLiter > 0, 'El precio por litro tiene que ser mayor que cero.')
  const expense: CarExpense = {
    id: newId(),
    date: input.date,
    kind: 'gasolina',
    liters: input.liters,
    pricePerLiter: input.pricePerLiter,
    totalCents: input.totalCents ?? fuelTotalCents(input.liters, input.pricePerLiter),
    odometerKm: input.odometerKm,
    createdAt: Date.now(),
  }
  await getDb().insert(carTable).values(carExpenseToRow(expense))
  return expense
}

export async function addOther(input: OtherInput): Promise<CarExpense> {
  check(isValidDay(input.date), 'Fecha no válida.')
  check(input.description.trim().length > 0, 'Falta la descripción.')
  check(input.totalCents > 0, 'El importe tiene que ser mayor que cero.')
  const expense: CarExpense = {
    id: newId(),
    date: input.date,
    kind: input.kind,
    description: input.description.trim(),
    totalCents: input.totalCents,
    createdAt: Date.now(),
  }
  await getDb().insert(carTable).values(carExpenseToRow(expense))
  return expense
}

export async function updateExpense(
  id: string,
  patch: Partial<Omit<CarExpense, 'id' | 'createdAt'>>,
): Promise<void> {
  if (patch.date !== undefined) check(isValidDay(patch.date), 'Fecha no válida.')
  if (patch.totalCents !== undefined) check(patch.totalCents > 0, 'El importe tiene que ser mayor que cero.')
  await getDb().update(carTable).set(patchToColumns(patch)).where(eq(carTable.id, id))
}

export async function deleteExpense(id: string): Promise<void> {
  await getDb().delete(carTable).where(eq(carTable.id, id))
}

export async function listExpenses(): Promise<CarExpense[]> {
  const rows = await getDb().select().from(carTable).orderBy(desc(carTable.date), desc(carTable.createdAt))
  return rows.map(rowToCarExpense)
}

/* --- Cuentas ------------------------------------------------------------- */

export interface MonthTotals {
  month: string
  gasolina: number
  taller: number
  recambio: number
  total: number
  liters: number
}

/** Totales en céntimos de cada mes pedido, en el mismo orden. Meses sin gastos van a cero. */
export function monthlyTotals(expenses: CarExpense[], months: string[]): MonthTotals[] {
  const byMonth = new Map<string, MonthTotals>()
  for (const m of months) {
    byMonth.set(m, { month: m, gasolina: 0, taller: 0, recambio: 0, total: 0, liters: 0 })
  }
  for (const e of expenses) {
    const t = byMonth.get(monthOf(e.date))
    if (!t) continue
    t[e.kind] += e.totalCents
    t.total += e.totalCents
    if (e.kind === 'gasolina' && e.liters) t.liters += e.liters
  }
  return months.map((m) => byMonth.get(m)!)
}

/**
 * Consumo medio en L/100 km por el método de depósito lleno: entre dos
 * repostajes con kilómetros apuntados, los litros del SEGUNDO son los que se
 * gastaron en ese tramo. Los del primero llenan lo que se gastó antes, que no
 * se sabe cuánto fue.
 *
 * Devuelve null si no hay al menos dos repostajes con kilómetros.
 */
export function averageConsumption(expenses: CarExpense[]): number | null {
  const fills = expenses
    .filter((e) => e.kind === 'gasolina' && e.odometerKm !== undefined && e.liters)
    .sort((a, b) => a.odometerKm! - b.odometerKm!)
  if (fills.length < 2) return null
  const km = fills[fills.length - 1].odometerKm! - fills[0].odometerKm!
  if (km <= 0) return null
  const liters = fills.slice(1).reduce((sum, e) => sum + e.liters!, 0)
  return (liters / km) * 100
}

/** Precio medio pagado por litro, ponderado por litros. null si no hay repostajes. */
export function averagePricePerLiter(expenses: CarExpense[]): number | null {
  let liters = 0
  let cents = 0
  for (const e of expenses) {
    if (e.kind !== 'gasolina' || !e.liters) continue
    liters += e.liters
    cents += e.totalCents
  }
  return liters > 0 ? cents / 100 / liters : null
}
