import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { today } from '../lib/dates'
import type { DayString } from '../types'

/**
 * El día de hoy, que cambia solo a medianoche y al volver a la app. Sin esto,
 * abrir la app por la mañana después de dejarla abierta por la noche seguía
 * enseñando las medicinas de ayer como pendientes.
 */
export function useToday(): DayString {
  const [day, setDay] = useState(today)
  useEffect(() => {
    const update = () => setDay(today())
    const timer = setInterval(update, 60_000)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && update())
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [])
  return day
}
