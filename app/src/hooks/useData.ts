// Consultas reactivas de cada parte de la app. Viven aquí y no en `src/lib`
// porque `useLiveQuery` es de expo-sqlite y solo funciona en el móvil.
//
// Todas devuelven `{ data, ready }`: `useLiveQuery` arranca con la lista vacía y
// lanza la consulta en un efecto, así que en el primer render «no hay nada» es
// indistinguible de «todavía no ha respondido». Sin `ready`, la pestaña de
// medicinas enseñaba «no tienes medicinas» un instante al abrirla.
import { useMemo } from 'react'
import { asc, desc, eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { db } from '../lib/db'
import { cache, carExpenses, deviceNames, intakes, listItems, medicines, quickNotes, savedLinks } from '../lib/schema'
import { rowToCarExpense, rowToIntake, rowToListItem, rowToMedicine, rowToQuickNote, rowToSavedLink } from '../lib/rows'
import { TODAY_CACHE_KEY } from '../lib/today'
import { WEATHER_CACHE_KEY } from '../lib/weather/weather'
import type { CachedWeather } from '../lib/weather/core'
import type { TodayData } from '../lib/nextcloud'
import type { CarExpense, ListItem, ListKind, Medicine, MedicineIntake, QuickNote, SavedLink } from '../types'

export interface Query<T> {
  data: T
  ready: boolean
}

export function useCarExpenses(): Query<CarExpense[]> {
  const { data, updatedAt } = useLiveQuery(
    db.select().from(carExpenses).orderBy(desc(carExpenses.date), desc(carExpenses.createdAt)),
  )
  return { data: useMemo(() => data.map(rowToCarExpense), [data]), ready: updatedAt !== undefined }
}

export function useMedicines(): Query<Medicine[]> {
  const { data, updatedAt } = useLiveQuery(
    db.select().from(medicines).orderBy(asc(medicines.time), asc(medicines.name)),
  )
  return { data: useMemo(() => data.map(rowToMedicine), [data]), ready: updatedAt !== undefined }
}

export function useIntakes(): Query<MedicineIntake[]> {
  const { data, updatedAt } = useLiveQuery(db.select().from(intakes))
  return { data: useMemo(() => data.map(rowToIntake), [data]), ready: updatedAt !== undefined }
}

export function useList(list: ListKind): Query<ListItem[]> {
  const { data, updatedAt } = useLiveQuery(
    db
      .select()
      .from(listItems)
      .where(eq(listItems.list, list))
      .orderBy(asc(listItems.done), asc(listItems.createdAt)),
    [list],
  )
  return { data: useMemo(() => data.map(rowToListItem), [data]), ready: updatedAt !== undefined }
}

export function useNotes(): Query<QuickNote[]> {
  const { data, updatedAt } = useLiveQuery(db.select().from(quickNotes).where(eq(quickNotes.done, false)))
  return { data: useMemo(() => data.map(rowToQuickNote), [data]), ready: updatedAt !== undefined }
}

export function useSaved(): Query<SavedLink[]> {
  const { data, updatedAt } = useLiveQuery(db.select().from(savedLinks).orderBy(desc(savedLinks.createdAt)))
  return { data: useMemo(() => data.map(rowToSavedLink), [data]), ready: updatedAt !== undefined }
}

/** Nombres de los dispositivos de la red, por MAC. */
export function useDeviceNames(): Query<Record<string, string>> {
  const { data, updatedAt } = useLiveQuery(db.select().from(deviceNames))
  return { data: useMemo(() => Object.fromEntries(data.map((d) => [d.mac, d.name])), [data]), ready: updatedAt !== undefined }
}

/** La última previsión guardada, o null si nunca se ha traído. */
export function useWeatherCache(): Query<{ value: CachedWeather; fetchedAt: number } | null> {
  const { data, updatedAt } = useLiveQuery(db.select().from(cache).where(eq(cache.key, WEATHER_CACHE_KEY)))
  const parsed = useMemo(() => {
    const row = data[0]
    if (!row) return null
    try {
      return { value: JSON.parse(row.value) as CachedWeather, fetchedAt: row.fetchedAt }
    } catch {
      return null
    }
  }, [data])
  return { data: parsed, ready: updatedAt !== undefined }
}

/** Lo último que se trajo de Nextcloud para la pestaña Hoy, o null si nunca. */
export function useTodayCache(): Query<{ value: TodayData; fetchedAt: number } | null> {
  const { data, updatedAt } = useLiveQuery(
    db.select().from(cache).where(eq(cache.key, TODAY_CACHE_KEY)),
  )
  const parsed = useMemo(() => {
    const row = data[0]
    if (!row) return null
    try {
      return { value: JSON.parse(row.value) as TodayData, fetchedAt: row.fetchedAt }
    } catch {
      return null
    }
  }, [data])
  return { data: parsed, ready: updatedAt !== undefined }
}
