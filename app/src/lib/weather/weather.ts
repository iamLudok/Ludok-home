// El tiempo de Hoy: dónde (la ciudad fija o la ubicación aproximada del
// móvil), pedir la previsión a Open-Meteo cuando toca y guardarla en la caché
// para verla sin conexión. Se llama al abrir la app y al volver a ella, como
// las tareas: nada en segundo plano.
import * as Location from 'expo-location'
import { getSettings, updateSettings } from '../settings'
import { readCache, writeCache } from '../cache'
import { forecastUrl, geocodeUrl, needsRefresh, parseForecast, parseGeocode, type CachedWeather, type Place } from './core'

export const WEATHER_CACHE_KEY = 'tiempo'

/** Qué falta para poder dar el tiempo, si falta algo. */
export type Missing = 'elegir' | 'permiso' | 'ubicacion'

type Where = { lat: number; lon: number; place?: string } | { missing: Missing }

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('timeout')), ms)))])
  } finally {
    clearTimeout(timer)
  }
}

async function where(): Promise<Where> {
  const s = await getSettings()
  if (s.weatherPlace && s.weatherLat != null && s.weatherLon != null) return { lat: s.weatherLat, lon: s.weatherLon, place: s.weatherPlace }
  // Aquí nunca se pide el permiso: esto corre al volver a la app y una ventana
  // de permiso que sale sola, sin haber tocado nada, no se entiende. Lo pide
  // la tarjeta del tiempo, cuando se pulsa «Usar mi ubicación».
  const perm = await Location.getForegroundPermissionsAsync()
  if (perm.status === Location.PermissionStatus.UNDETERMINED) return { missing: 'elegir' }
  if (perm.status !== Location.PermissionStatus.GRANTED) return { missing: 'permiso' }
  try {
    // La última conocida vale si es de hace menos de media hora: es al
    // momento y no enciende nada. Si no, una nueva al kilómetro, que es lo que
    // da el permiso de ubicación aproximada.
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 })
    const pos = last ?? (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), 15_000))
    return { lat: pos.coords.latitude, lon: pos.coords.longitude }
  } catch {
    // Con la ubicación del móvil apagada, o sin señal en un sótano.
    return { missing: 'ubicacion' }
  }
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}.`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export type WeatherRefresh = { status: 'ok' | 'al-dia' } | { status: 'falta'; missing: Missing } | { status: 'error'; message: string }

/** Trae la previsión si hace falta (o siempre, con `force`) y la deja en la caché. */
export async function refreshWeather(force = false): Promise<WeatherRefresh> {
  try {
    const w = await where()
    if ('missing' in w) return { status: 'falta', missing: w.missing }
    const cached = await readCache<CachedWeather>(WEATHER_CACHE_KEY)
    if (!force && !needsRefresh(cached, w)) return { status: 'al-dia' }
    const weather = parseForecast(await getJson(forecastUrl(w.lat, w.lon)))
    await writeCache<CachedWeather>(WEATHER_CACHE_KEY, { weather, lat: w.lat, lon: w.lon, place: w.place })
    return { status: 'ok' }
  } catch (e) {
    return { status: 'error', message: e instanceof Error && e.message !== 'Aborted' ? e.message : 'No se pudo traer el tiempo.' }
  }
}

/** Pide el permiso de ubicación (aproximada) y, si lo dan, trae el tiempo. */
export async function chooseMyLocation(): Promise<WeatherRefresh> {
  const perm = await Location.requestForegroundPermissionsAsync()
  if (perm.status !== Location.PermissionStatus.GRANTED) return { status: 'falta', missing: 'permiso' }
  await updateSettings({ weatherPlace: undefined, weatherLat: undefined, weatherLon: undefined })
  return refreshWeather(true)
}

/** Fija una ciudad (o la quita, con null, para volver a «donde estás»). */
export async function setWeatherPlace(place: Place | null): Promise<WeatherRefresh> {
  await updateSettings({ weatherPlace: place?.name, weatherLat: place?.lat, weatherLon: place?.lon })
  return refreshWeather(true)
}

export async function searchPlaces(query: string): Promise<Place[]> {
  if (query.trim().length < 2) return []
  return parseGeocode(await getJson(geocodeUrl(query)))
}
