import { useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Card, SectionTitle } from '../ui/Card'
import { Txt } from '../ui/Text'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Sheet } from '../ui/Sheet'
import { usePalette } from '../ui/ThemeProvider'
import { space } from '../ui/theme'
import { WeatherIcon } from './WeatherIcon'
import { useWeatherCache } from '../hooks/useData'
import { useSettings } from '../hooks/useSettings'
import { whenFetched } from '../lib/format'
import { deg, rainHint, sky, upcomingHours, type Place } from '../lib/weather/core'
import { chooseMyLocation, refreshWeather, searchPlaces, setWeatherPlace, type WeatherRefresh } from '../lib/weather/weather'

const MISSING_TEXT = {
  elegir: '¿El tiempo de dónde? Puede ser el de donde estés (ubicación aproximada, al kilómetro) o el de una ciudad fija.',
  permiso: 'La app no tiene permiso de ubicación. Elige una ciudad, o dale permiso en los ajustes del móvil.',
  ubicacion: 'No se ha podido saber dónde estás: ¿tienes la ubicación del móvil apagada?',
} as const

/** «2026-10-18T19:42» en la hora del móvil, para saber qué horas ya han pasado. */
function localNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * El tiempo en Hoy: ahora, máxima y mínima, si va a llover y las próximas
 * horas. Sale de la caché, así que sin conexión enseña lo último que se trajo
 * (sin las horas que ya han pasado). Se actualiza con el resto de Hoy.
 */
export function WeatherCard() {
  const settings = useSettings()
  const cache = useWeatherCache()
  const [status, setStatus] = useState<WeatherRefresh | null>(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    refreshWeather().then(setStatus)
  }, [])

  const act = async (fn: () => Promise<WeatherRefresh>) => {
    setBusy(true)
    setPicking(false)
    setStatus(await fn())
    setBusy(false)
  }

  const c = cache.data
  const w = c?.value.weather
  const hours = useMemo(() => (w ? upcomingHours(w.hours, localNow()) : []), [w])
  const missing = status?.status === 'falta' ? status.missing : null
  const place = settings.weatherPlace ?? 'Donde estás'

  if (!cache.ready) return null

  return (
    <Card>
      <SectionTitle
        title="Tiempo"
        right={
          w ? (
            <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityHint="Cambiar de sitio" hitSlop={8}>
              <Txt variant="data" tone="faint">
                {place} · {whenFetched(c!.fetchedAt)}
              </Txt>
            </Pressable>
          ) : null
        }
      />

      {w ? (
        <>
          <View style={styles.now}>
            <WeatherIcon kind={sky(w.now.code).icon} isDay={w.now.isDay} size={48} />
            <Txt variant="hero">{deg(w.now.temp)}</Txt>
            <View style={styles.grow}>
              <Txt variant="body">{sky(w.now.code).text}</Txt>
              <Txt variant="data" tone="muted">
                Sensación {deg(w.now.feels)} · Máx {deg(w.today.max)} · Mín {deg(w.today.min)}
              </Txt>
            </View>
          </View>

          {hours.length ? (
            <>
              <Txt variant="small">{rainHint(hours, w.now)}</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
                {hours.map((h) => (
                  <View key={h.time} style={styles.hour}>
                    <Txt variant="data" tone="muted">
                      {Number(h.time.slice(11, 13))}h
                    </Txt>
                    <WeatherIcon kind={sky(h.code).icon} isDay={h.isDay} size={22} />
                    <Txt variant="data">{deg(h.temp)}</Txt>
                    <Txt variant="data" tone="faint">
                      {h.rainProb >= 20 ? `${h.rainProb} %` : ' '}
                    </Txt>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}

          {w.tomorrow ? (
            <Txt variant="data" tone="muted">
              Mañana: {sky(w.tomorrow.code).text.toLowerCase()}, {deg(w.tomorrow.max)} / {deg(w.tomorrow.min)}
              {w.tomorrow.rainProb >= 20 ? `, lluvia ${w.tomorrow.rainProb} %` : ''}
            </Txt>
          ) : null}
        </>
      ) : null}

      {missing && (!w || missing !== 'elegir') ? (
        <>
          <Txt variant="small" tone="muted">
            {MISSING_TEXT[missing]}
          </Txt>
          <View style={styles.buttons}>
            {missing === 'permiso' ? (
              <Button title="Abrir ajustes del móvil" small onPress={() => Linking.openSettings()} />
            ) : (
              <Button title="Usar mi ubicación" kind="primary" small onPress={() => act(chooseMyLocation)} disabled={busy} />
            )}
            <Button title="Elegir ciudad" small onPress={() => setPicking(true)} disabled={busy} />
          </View>
        </>
      ) : null}

      {!w && !missing ? (
        <Txt variant="small" tone="muted">
          {status?.status === 'error' ? status.message : 'Cargando…'}
        </Txt>
      ) : null}
      {w && status?.status === 'error' ? (
        <Txt variant="small" tone="faint">
          No se ha podido actualizar: {status.message}
        </Txt>
      ) : null}

      <PlacePicker
        visible={picking}
        current={settings.weatherPlace}
        onClose={() => setPicking(false)}
        onHere={() => act(chooseMyLocation)}
        onPick={(p) => act(() => setWeatherPlace(p))}
      />
    </Card>
  )
}

/** Elegir ciudad (buscador de Open-Meteo) o volver a «donde estés». */
function PlacePicker({
  visible,
  current,
  onClose,
  onHere,
  onPick,
}: {
  visible: boolean
  current?: string
  onClose: () => void
  onHere: () => void
  onPick: (p: Place) => void
}) {
  const palette = usePalette()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Se busca al dejar de escribir, no con cada letra.
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      searchPlaces(query).then(
        (r) => {
          setResults(r)
          setError(null)
        },
        () => setError('No se ha podido buscar. ¿Hay conexión?'),
      )
    }, 400)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  return (
    <Sheet visible={visible} title="El tiempo de dónde" onClose={onClose}>
      <Button title="Usar mi ubicación (aproximada)" onPress={onHere} />
      <Field value={query} onChangeText={setQuery} placeholder="Buscar ciudad: Bilbao, Donostia…" autoCapitalize="words" />
      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : null}
      {results.map((p) => (
        <Pressable
          key={`${p.lat},${p.lon}`}
          onPress={() => onPick(p)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.result, { borderColor: palette.line, opacity: pressed ? 0.6 : 1 }]}
        >
          <Txt variant="body">{p.name}</Txt>
          <Txt variant="data" tone="faint">
            {p.detail}
          </Txt>
        </Pressable>
      ))}
      {current ? (
        <Txt variant="small" tone="faint">
          Ahora: {current}, fija.
        </Txt>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  now: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1, gap: 2 },
  hours: { gap: space.lg, paddingRight: space.lg },
  hour: { alignItems: 'center', gap: space.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  result: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm, gap: 2 },
})
