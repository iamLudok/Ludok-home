/**
 * El tiempo de Hoy, sin red: leer la previsión de Open-Meteo, textos e iconos,
 * horas que quedan, aviso de lluvia, buscador de ciudades y cuándo volver a
 * pedirla. La respuesta de prueba tiene la forma exacta de la de Open-Meteo
 * (comprobada con curl), recortada.
 */
import { check, eq, finish } from './harness'
import {
  deg,
  distanceKm,
  forecastUrl,
  geocodeUrl,
  hh,
  needsRefresh,
  parseForecast,
  parseGeocode,
  rainHint,
  sky,
  upcomingHours,
  type CachedWeather,
  type Hour,
} from '../src/lib/weather/core'

const RESPONSE = {
  latitude: 43.26,
  longitude: -2.93,
  timezone: 'Europe/Madrid',
  current: { time: '2026-10-18T18:45', interval: 900, temperature_2m: 15.7, apparent_temperature: 14.3, weather_code: 1, is_day: 1, wind_speed_10m: 7.9 },
  hourly: {
    time: ['2026-10-18T18:00', '2026-10-18T19:00', '2026-10-18T20:00', '2026-10-18T21:00'],
    temperature_2m: [16.3, 15.5, 14.7, 14.2],
    weather_code: [3, 0, 0, 61],
    precipitation_probability: [0, 0, 10, 60],
    is_day: [1, 1, 0, 0],
  },
  daily: {
    time: ['2026-10-18', '2026-10-19'],
    weather_code: [51, 51],
    temperature_2m_max: [16.8, 16.7],
    temperature_2m_min: [12.4, 11.3],
    precipitation_probability_max: [43, 33],
  },
}

function main() {
  console.log('Petición')
  const url = new URL(forecastUrl(43.262712, -2.925283))
  eq('coordenadas con 3 decimales (unos 100 m: de sobra, y no delata la casa exacta)', url.searchParams.get('latitude'), '43.263')
  eq('hora del sitio', url.searchParams.get('timezone'), 'auto')
  check('pide lo que se enseña', ['temperature_2m', 'weather_code', 'precipitation_probability'].every((k) => url.searchParams.get('hourly')!.includes(k)))

  console.log('\nLeer la previsión')
  const w = parseForecast(RESPONSE)
  eq('ahora', `${w.now.temp} ${w.now.feels} ${w.now.code} ${w.now.isDay}`, '15.7 14.3 1 true')
  eq('hoy', `${w.today.max}/${w.today.min} ${w.today.rainProb}%`, '16.8/12.4 43%')
  eq('mañana', w.tomorrow?.date, '2026-10-19')
  eq('horas', w.hours.length, 4)
  eq('de noche se sabe', w.hours[2].isDay, false)
  let bad: Error | null = null
  try {
    parseForecast({ error: true, reason: 'Latitude must be in range' })
  } catch (e) {
    bad = e as Error
  }
  check('una respuesta de error no pasa por previsión', /no es una previsión/.test(bad?.message ?? ''))

  console.log('\nTextos e iconos')
  eq('despejado', sky(0).text, 'Despejado')
  eq('poco nuboso', sky(2).icon, 'pocas-nubes')
  eq('chubascos llevan el icono de lluvia', sky(81).icon, 'lluvia')
  eq('tormenta con granizo', sky(99).icon, 'tormenta')
  eq('código desconocido no rompe', sky(42).text, 'Sin datos')
  eq('grados redondeados', deg(15.7), '16°')
  eq('sin «-0°»', deg(-0.4), '0°')
  eq('bajo cero', deg(-3.6), '-4°')
  eq('hora corta', hh('2026-10-18T07:00'), '7:00')

  console.log('\nHoras que quedan')
  eq('desde la hora en curso, aunque vaya por la mitad', upcomingHours(w.hours, '2026-10-18T18:45')[0].time, '2026-10-18T18:00')
  eq('guardada de antes: las pasadas no salen', upcomingHours(w.hours, '2026-10-18T20:10').length, 2)
  eq('con tope', upcomingHours(w.hours, '2026-10-18T18:00', 2).length, 2)

  console.log('\nAviso de lluvia')
  const H = (time: string, code: number, rainProb: number): Hour => ({ time: `2026-10-18T${time}`, temp: 15, code, rainProb, isDay: true })
  eq('lluvia más tarde, con la hora y la probabilidad', rainHint(w.hours, w.now), 'Lluvia probable hacia las 21:00 (60 %).')
  eq('sin lluvia', rainHint([H('18:00', 0, 0), H('19:00', 2, 20)], { code: 0 }), 'Sin lluvia en las próximas 2 horas.')
  eq('el 50 % ya cuenta aunque el código sea nublado', rainHint([H('18:00', 3, 10), H('19:00', 3, 50)], { code: 3 }), 'Lluvia probable hacia las 19:00 (50 %).')
  eq('nieve', rainHint([H('18:00', 73, 80)], { code: 3 }), 'Nieve probable hacia las 18:00 (80 %).')
  // Caso real de Open-Meteo: código de llovizna con un 0 % de probabilidad.
  eq('icono de llovizna con 0 % no es lluvia probable', rainHint([H('05:00', 3, 0), H('06:00', 51, 0)], { code: 0 }), 'Sin lluvia en las próximas 2 horas.')
  eq('icono de lluvia con 30 % sí', rainHint([H('06:00', 61, 30)], { code: 0 }), 'Lluvia probable hacia las 6:00 (30 %).')
  eq('lloviendo ya, y cuándo para', rainHint([H('18:00', 63, 90), H('19:00', 61, 70), H('20:00', 3, 20)], { code: 63 }), 'Lluvia ahora; para hacia las 20:00.')
  eq('lloviendo y no para', rainHint([H('18:00', 63, 90), H('19:00', 61, 70)], { code: 63 }), 'Lluvia ahora, y sigue.')

  console.log('\nElegir ciudad')
  eq('búsqueda en castellano', new URL(geocodeUrl(' Bilbao ')).searchParams.get('name'), 'Bilbao')
  const places = parseGeocode({
    results: [
      { name: 'Bilbao', latitude: 43.26271, longitude: -2.92528, country: 'España', admin1: 'Comunidad Autónoma del País Vasco', admin2: 'Bizkaia' },
      { name: 'Bilbao', latitude: 13.2634, longitude: 124.0227, country: 'Filipinas', admin1: 'Bicolandia', admin2: 'Province of Albay' },
      { name: 'Sin coordenadas', country: 'España' },
    ],
  })
  eq('las que tienen coordenadas', places.length, 2)
  eq('con provincia y país para distinguirlas', places[0].detail, 'Bizkaia, España')
  eq('sin resultados, lista vacía', parseGeocode({ generationtime_ms: 0.3 }).length, 0)

  console.log('\nCuándo volver a pedirla')
  const bilbao = { lat: 43.263, lon: -2.925 }
  const cached = (place?: string, fetchedAt = 1_000_000) => ({ value: { weather: w, ...bilbao, place } as CachedWeather, fetchedAt })
  check('sin nada guardado, sí', needsRefresh(null, bilbao))
  check('de hace 10 min y en el mismo sitio, no', !needsRefresh(cached(), bilbao, 1_000_000 + 10 * 60_000))
  check('de hace 40 min, sí', needsRefresh(cached(), bilbao, 1_000_000 + 40 * 60_000))
  check('a 2 km (otro barrio), no', !needsRefresh(cached(), { lat: 43.28, lon: -2.925 }, 1_000_000))
  check('en otra ciudad, sí aunque sea reciente', needsRefresh(cached(), { lat: 43.32, lon: -1.98 }, 1_000_000))
  check('de «donde estás» a ciudad fija, sí', needsRefresh(cached(), { ...bilbao, place: 'Bilbao' }, 1_000_000))
  check('de Bilbao a Donostia, unos 80 km', Math.abs(distanceKm(bilbao, { lat: 43.32, lon: -1.98 }) - 76) < 5)

  finish('verify:weather')
}

main()
