// Días de calendario en hora local, como texto 'YYYY-MM-DD'.
//
// Toda la aritmética de días se hace en UTC a partir de los números del texto,
// nunca sumando 86 400 000 ms a un instante local: el día del cambio de hora
// dura 23 o 25 horas, y sumar «un día en milisegundos» a medianoche cae en el
// mismo día o se salta uno. Con eso, una medicina «cada 48 h» se desplazaba un
// día dos veces al año.
import type { DayString, TimeString } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

/** El día local de un instante. */
export function dayOf(date: Date): DayString {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Hoy, en hora local. */
export function today(now = new Date()): DayString {
  return dayOf(now)
}

function toUtcMs(day: DayString): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtcMs(ms: number): DayString {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function addDays(day: DayString, n: number): DayString {
  return fromUtcMs(toUtcMs(day) + n * 86_400_000)
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function diffDays(from: DayString, to: DayString): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000)
}

/** Lista de días [from, to], ambos incluidos. */
export function daysBetween(from: DayString, to: DayString): DayString[] {
  const out: DayString[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** El instante local de un día a una hora 'HH:MM'. */
export function atTime(day: DayString, time: TimeString): Date {
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  return fromUtcMs(toUtcMs(day)) === day
}

export function isValidTime(time: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(time)
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60
}

/** 'YYYY-MM' del día. */
export function monthOf(day: DayString): string {
  return day.slice(0, 7)
}

/** Los últimos `n` meses 'YYYY-MM', del más antiguo al actual. */
export function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  return out
}
