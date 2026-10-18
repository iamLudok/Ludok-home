// Fechas y horas en castellano para la interfaz. Sin `toLocaleDateString`: en
// Hermes el soporte de idiomas depende de cómo se compiló el motor, y en algunos
// móviles salía «Saturday, October 17» con la app entera en castellano.
import { diffDays, today } from './dates'
import type { DayString } from '../types'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function parts(day: DayString): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number)
  return [y, m, d]
}

/** «sábado 17 de octubre» */
export function longDate(day: DayString): string {
  const [y, m, d] = parts(day)
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`
}

/** «17 oct», o «hoy» / «ayer» / «mañana» cuando toca. */
export function shortDate(day: DayString, todayDay: DayString = today()): string {
  const diff = diffDays(todayDay, day)
  if (diff === 0) return 'hoy'
  if (diff === -1) return 'ayer'
  if (diff === 1) return 'mañana'
  const [y, m, d] = parts(day)
  const sameYear = todayDay.slice(0, 4) === String(y)
  return sameYear ? `${d} ${MESES_CORTOS[m - 1]}` : `${d} ${MESES_CORTOS[m - 1]} ${y}`
}

/** 'YYYY-MM' → «oct» (para el eje del gráfico) */
export function monthShort(month: string): string {
  return MESES_CORTOS[Number(month.slice(5, 7)) - 1]
}

/** 'YYYY-MM' → «octubre de 2026» */
export function monthLong(month: string): string {
  return `${MESES[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Instante → «08:30» */
export function clock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** «hace un momento», «a las 08:30», «ayer a las 21:10», «12 oct» */
export function whenFetched(ms: number, now = Date.now()): string {
  if (now - ms < 60_000) return 'hace un momento'
  const day = today(new Date(ms))
  const t = today(new Date(now))
  if (day === t) return `a las ${clock(ms)}`
  if (diffDays(day, t) === 1) return `ayer a las ${clock(ms)}`
  return shortDate(day, t)
}

/** Segundos → «3:07» */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}
