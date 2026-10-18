// El tiempo de Hoy, sin red: qué se le pide a Open-Meteo, cómo se lee lo que
// devuelve y cómo se dice. La parte que habla con la red y con la ubicación
// está en `weather.ts`; esta se prueba en `verify/weather.ts`.
//
// Open-Meteo y no otro: es la fuente por defecto de Breezy Weather (así se ve
// lo mismo que allí), mezcla los modelos de AEMET, Météo-France y DWD, y no
// pide cuenta ni clave.

/** Qué dibujo le toca. Pocos y claros: la interfaz no lleva librería de iconos. */
export type WeatherIcon = 'despejado' | 'pocas-nubes' | 'nubes' | 'niebla' | 'llovizna' | 'lluvia' | 'nieve' | 'tormenta'

export interface Sky {
  text: string
  icon: WeatherIcon
}

/** Códigos WMO de Open-Meteo → texto e icono. */
const CODES: Record<number, Sky> = {
  0: { text: 'Despejado', icon: 'despejado' },
  1: { text: 'Casi despejado', icon: 'pocas-nubes' },
  2: { text: 'Poco nuboso', icon: 'pocas-nubes' },
  3: { text: 'Nublado', icon: 'nubes' },
  45: { text: 'Niebla', icon: 'niebla' },
  48: { text: 'Niebla con escarcha', icon: 'niebla' },
  51: { text: 'Llovizna débil', icon: 'llovizna' },
  53: { text: 'Llovizna', icon: 'llovizna' },
  55: { text: 'Llovizna intensa', icon: 'llovizna' },
  56: { text: 'Llovizna helada', icon: 'llovizna' },
  57: { text: 'Llovizna helada intensa', icon: 'llovizna' },
  61: { text: 'Lluvia débil', icon: 'lluvia' },
  63: { text: 'Lluvia', icon: 'lluvia' },
  65: { text: 'Lluvia fuerte', icon: 'lluvia' },
  66: { text: 'Lluvia helada', icon: 'lluvia' },
  67: { text: 'Lluvia helada fuerte', icon: 'lluvia' },
  71: { text: 'Nieve débil', icon: 'nieve' },
  73: { text: 'Nieve', icon: 'nieve' },
  75: { text: 'Nieve fuerte', icon: 'nieve' },
  77: { text: 'Granos de nieve', icon: 'nieve' },
  80: { text: 'Chubascos débiles', icon: 'lluvia' },
  81: { text: 'Chubascos', icon: 'lluvia' },
  82: { text: 'Chubascos fuertes', icon: 'lluvia' },
  85: { text: 'Chubascos de nieve', icon: 'nieve' },
  86: { text: 'Chubascos de nieve fuertes', icon: 'nieve' },
  95: { text: 'Tormenta', icon: 'tormenta' },
  96: { text: 'Tormenta con granizo', icon: 'tormenta' },
  99: { text: 'Tormenta con granizo fuerte', icon: 'tormenta' },
}

export function sky(code: number): Sky {
  return CODES[code] ?? { text: 'Sin datos', icon: 'nubes' }
}

const WET: WeatherIcon[] = ['llovizna', 'lluvia', 'nieve', 'tormenta']

export interface Hour {
  /** «2026-10-18T19:00», en la hora del sitio. */
  time: string
  temp: number
  code: number
  rainProb: number
  isDay: boolean
}

export interface Day {
  date: string
  max: number
  min: number
  code: number
  rainProb: number
}

export interface Weather {
  now: { time: string; temp: number; feels: number; code: number; isDay: boolean; windKmh: number }
  today: Day
  tomorrow: Day | null
  hours: Hour[]
}

const HOURS = 24

export function forecastUrl(lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    // La hora del sitio y no la del móvil: así «a las 17» es la de allí.
    timezone: 'auto',
    forecast_days: '2',
    // Desde la hora en curso: guardado sin conexión, sigue sirviendo un rato.
    forecast_hours: String(HOURS),
  })
  return `https://api.open-meteo.com/v1/forecast?${p}`
}

export function parseForecast(json: any): Weather {
  const c = json?.current
  const h = json?.hourly
  const d = json?.daily
  if (!c || !h?.time || !d?.time) throw new Error('Open-Meteo ha devuelto algo que no es una previsión.')
  const day = (i: number): Day | null =>
    d.time[i] === undefined
      ? null
      : {
          date: d.time[i],
          max: d.temperature_2m_max[i],
          min: d.temperature_2m_min[i],
          code: d.weather_code[i],
          rainProb: d.precipitation_probability_max[i] ?? 0,
        }
  return {
    now: {
      time: c.time,
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      code: c.weather_code,
      isDay: c.is_day === 1,
      windKmh: c.wind_speed_10m,
    },
    today: day(0)!,
    tomorrow: day(1),
    hours: (h.time as string[]).map((time, i) => ({
      time,
      temp: h.temperature_2m[i],
      code: h.weather_code[i],
      rainProb: h.precipitation_probability[i] ?? 0,
      isDay: h.is_day[i] === 1,
    })),
  }
}

/**
 * Las horas que aún no han pasado, a partir de la hora en curso. `now` es
 * «2026-10-18T19:42» en la hora del sitio: las horas se comparan como texto,
 * que con este formato ordena igual que las fechas.
 */
export function upcomingHours(hours: Hour[], now: string, count = 12): Hour[] {
  const current = now.slice(0, 13)
  return hours.filter((h) => h.time.slice(0, 13) >= current).slice(0, count)
}

/** Lo que más importa al salir de casa: si va a llover, y cuándo. */
const RAIN_PROB = 50
const WET_CODE_PROB = 30

export function rainHint(hours: Hour[], now: { code: number }): string {
  if (WET.includes(sky(now.code).icon)) {
    const dry = hours.find((h, i) => i > 0 && h.rainProb < RAIN_PROB && !WET.includes(sky(h.code).icon))
    return dry ? `${sky(now.code).text} ahora; para hacia las ${hh(dry.time)}.` : `${sky(now.code).text} ahora, y sigue.`
  }
  // El icono de lluvia solo cuenta con algo de probabilidad: el código sale de
  // un modelo y la probabilidad de otros, y Open-Meteo da «llovizna» con un 0 %
  // a menudo. Sin esto salía «Lluvia probable hacia las 6:00 (0 %)».
  const wet = hours.find((h) => h.rainProb >= RAIN_PROB || (WET.includes(sky(h.code).icon) && h.rainProb >= WET_CODE_PROB))
  if (!wet) return `Sin lluvia en las próximas ${hours.length} horas.`
  const what = sky(wet.code).icon === 'nieve' ? 'Nieve' : 'Lluvia'
  return `${what} probable hacia las ${hh(wet.time)} (${wet.rainProb} %).`
}

/** «2026-10-18T07:00» → «7:00». */
export function hh(time: string): string {
  return `${Number(time.slice(11, 13))}:${time.slice(14, 16)}`
}

/** 15.7 → «16°»; -0.4 → «0°» (y no «-0°»). */
export function deg(n: number): string {
  const r = Math.round(n)
  return `${r === 0 ? 0 : r}°`
}

/* --- Elegir ciudad -------------------------------------------------------- */

export interface Place {
  name: string
  /** «Bizkaia, España»: para distinguir los Bilbao del mundo. */
  detail: string
  lat: number
  lon: number
}

export function geocodeUrl(query: string): string {
  const p = new URLSearchParams({ name: query.trim(), count: '8', language: 'es', format: 'json' })
  return `https://geocoding-api.open-meteo.com/v1/search?${p}`
}

export function parseGeocode(json: any): Place[] {
  const results: any[] = Array.isArray(json?.results) ? json.results : []
  return results
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number' && r.name)
    .map((r) => ({
      name: r.name,
      // Provincia y país; la comunidad autónoma sobra si ya está la provincia.
      detail: [r.admin2 ?? r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    }))
}

/* --- Cuándo volver a pedirlo ---------------------------------------------- */

/** Distancia en km entre dos puntos (haversine): para saber si te has movido. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(s))
}

/** Lo que se guarda: la previsión y de dónde es. */
export interface CachedWeather {
  weather: Weather
  lat: number
  lon: number
  /** La ciudad fija, o nada si es «donde estás». */
  place?: string
}

const MAX_AGE_MS = 30 * 60_000
const MOVED_KM = 5

/**
 * Si hay que volver a pedirla. Open-Meteo actualiza cada hora o así: pedirla
 * cada vez que se vuelve a la app solo gasta. Pero si has cambiado de ciudad
 * (de la fija a otra, o te has movido más de 5 km), en el momento.
 */
export function needsRefresh(cached: { value: CachedWeather; fetchedAt: number } | null, where: { lat: number; lon: number; place?: string }, now = Date.now()): boolean {
  if (!cached) return true
  if (now - cached.fetchedAt > MAX_AGE_MS) return true
  if ((cached.value.place ?? '') !== (where.place ?? '')) return true
  return distanceKm(cached.value, where) > MOVED_KM
}
