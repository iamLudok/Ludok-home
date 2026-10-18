import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Network from 'expo-network'
import { Screen } from '../../src/ui/Screen'
import { Card, DataRow, SectionTitle } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Field } from '../../src/ui/Field'
import { Sheet } from '../../src/ui/Sheet'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'
import { useDocker } from '../../src/hooks/useDocker'
import { useSettings } from '../../src/hooks/useSettings'
import { updateSettings } from '../../src/lib/settings'
import { readCache, writeCache } from '../../src/lib/cache'
import { bytes, whenFetched } from '../../src/lib/format'
import { formatMbps, formatMs, maxTestBytes, verdict, type SpeedResult } from '../../src/lib/speed/core'
import { diagnose, LINE_SECONDS, type NetKind } from '../../src/lib/speed/line'
import { phoneSpeedTest, runLineTest } from '../../src/lib/speed/client'
import type { Phase } from '../../src/lib/speed/run'

const CACHE_KEY = 'velocidad'

interface Saved {
  line: SpeedResult | null
  lineError?: string
  phone: SpeedResult | null
  net: NetKind
}

/** Lo que se enseña mientras mide: qué parte va y cuánto lleva. */
type Live =
  | { stage: 'linea'; fraction: number }
  | { stage: 'movil'; phase: Phase; value: number; fraction: number }

const PHASE_LABEL: Record<Phase, string> = { ping: 'latencia', bajada: 'bajada', subida: 'subida' }

const NET_LABEL: Record<NetKind, string> = { wifi: 'por WiFi', datos: 'con datos móviles', otra: '' }

async function netKind(): Promise<NetKind> {
  const s = await Network.getNetworkStateAsync().catch(() => null)
  if (s?.type === Network.NetworkStateType.WIFI) return 'wifi'
  if (s?.type === Network.NetworkStateType.CELLULAR) return 'datos'
  return 'otra'
}

/** Mb/s con una cifra decimal como mucho, para las cifras grandes. */
const big = (n: number) => (n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace('.', ','))

/**
 * Test de velocidad: lo que hace «test de velocidad» en Google, sin Google, y
 * además si la operadora da lo contratado. Con un botón se mide primero la
 * LÍNEA (la Pi, por cable) y luego ESTE MÓVIL (contra Cloudflare), uno detrás
 * de otro: a la vez se repartirían la fibra y los dos saldrían mal.
 */
export default function Velocidad() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const settings = useSettings()
  const { api } = useDocker()
  const [live, setLive] = useState<Live | null>(null)
  const [saved, setSaved] = useState<{ value: Saved; at: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [down, setDown] = useState('')
  const [up, setUp] = useState('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    readCache<Saved>(CACHE_KEY).then((c) => c && setSaved({ value: c.value, at: c.fetchedAt }))
    // Salir de la pantalla corta el test del móvil: si no, seguiría gastando
    // datos sin verse. El de la Pi acaba solo en unos segundos.
    return () => abort.current?.abort()
  }, [])

  const contract = { downMbps: settings.contractDownMbps, upMbps: settings.contractUpMbps }

  const run = async (net: NetKind) => {
    setError(null)
    const controller = new AbortController()
    abort.current = controller
    let line: SpeedResult | null = null
    let lineError: string | undefined
    try {
      if (api) {
        // La Pi no avisa a mitad: la barra avanza por el tiempo que suele tardar.
        const t0 = Date.now()
        setLive({ stage: 'linea', fraction: 0 })
        const timer = setInterval(() => setLive({ stage: 'linea', fraction: Math.min(0.97, (Date.now() - t0) / 1000 / LINE_SECONDS) }), 250)
        try {
          line = await runLineTest(api)
        } catch (e) {
          lineError = e instanceof Error ? e.message : 'La Pi no ha podido medir la línea.'
        } finally {
          clearInterval(timer)
        }
        if (controller.signal.aborted) return
      }
      setLive({ stage: 'movil', phase: 'ping', value: 0, fraction: 0 })
      const phone = await phoneSpeedTest((p) => setLive({ stage: 'movil', ...p }), controller.signal)
      const value: Saved = { line, lineError, phone, net }
      const at = Date.now()
      await writeCache(CACHE_KEY, value, at)
      setSaved({ value, at })
    } catch (e) {
      if (controller.signal.aborted) return
      // Si el móvil falla pero la línea salió, se guarda igual: es lo importante.
      if (line) {
        const value: Saved = { line, phone: null, net }
        await writeCache(CACHE_KEY, value)
        setSaved({ value, at: Date.now() })
      }
      setError(e instanceof Error ? e.message : 'No se pudo medir')
    } finally {
      setLive(null)
      abort.current = null
    }
  }

  const start = async () => {
    const net = await netKind()
    // Con datos móviles se avisa antes: el test del móvil puede gastar cientos
    // de megas de la tarifa. El de la línea va por la fibra de casa y no cuenta.
    if (net !== 'datos') return run(net)
    Alert.alert('Con datos móviles', `La parte del móvil puede gastar hasta ${bytes(maxTestBytes())} de tu tarifa (menos cuanto más lenta sea la conexión).`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Medir', onPress: () => run(net) },
    ])
  }

  const saveContract = async () => {
    const parse = (s: string) => {
      const n = Math.round(Number(s.replace(',', '.')))
      return n > 0 ? n : undefined
    }
    await updateSettings({ contractDownMbps: parse(down), contractUpMbps: parse(up) })
    setEditing(false)
    toast(parse(down) ? 'Velocidad contratada guardada' : 'Velocidad contratada quitada')
  }

  const s = saved?.value
  const conclusions = s ? diagnose({ line: s.line, phone: s.phone, net: s.net, contract }) : []
  const summary = s?.line ?? s?.phone

  return (
    <Screen title="Velocidad" right={<Button title="Volver" kind="ghost" small onPress={() => router.back()} />}>
      <ScrollView contentContainerStyle={styles.content}>
        {live ? (
          <Card style={styles.center}>
            <Txt variant="label" tone="muted">
              {live.stage === 'linea' ? 'La Pi mide la línea, por cable' : `Este móvil: ${PHASE_LABEL[live.phase]}`}
            </Txt>
            <Txt variant="hero" accessibilityLiveRegion="polite">
              {live.stage === 'linea' ? '…' : live.phase === 'ping' ? formatMs(live.value) : formatMbps(live.value)}
            </Txt>
            <View style={[styles.track, { backgroundColor: palette.surface2 }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: palette.fg,
                    // Las dos partes en una barra: la línea la primera mitad y el móvil la segunda.
                    width: `${Math.round(100 * (live.stage === 'linea' ? live.fraction / 2 : 0.5 + movilFraction(live) / 2))}%`,
                  },
                ]}
              />
            </View>
            <Txt variant="small" tone="faint">
              {live.stage === 'linea' ? `Unos ${LINE_SECONDS} s; luego mide este móvil.` : 'Casi está.'}
            </Txt>
            <Button title="Cancelar" onPress={() => abort.current?.abort()} disabled={live.stage === 'linea'} />
          </Card>
        ) : null}

        {!live && !s ? (
          <Card style={styles.center}>
            <Txt variant="section">¿Te da la operadora lo que pagas?</Txt>
            <Txt variant="small" tone="muted" style={styles.centerText}>
              La Pi mide la línea por cable, que es lo que la operadora se compromete a darte, y luego este móvil mide lo
              que le llega a él. Tarda menos de un minuto.
            </Txt>
            <Button title="Medir" kind="primary" onPress={start} />
          </Card>
        ) : null}

        {error ? (
          <Txt variant="small" tone="danger">
            {error}
          </Txt>
        ) : null}

        {s && !live ? (
          <>
            <Card>
              <SectionTitle title="La línea, por cable" right={<Txt variant="data" tone="faint">{whenFetched(saved!.at)}</Txt>} />
              {s.line ? (
                <>
                  <Pair down={s.line.downMbps} up={s.line.upMbps} contractDown={contract.downMbps} contractUp={contract.upMbps} />
                  <DataRow label="Latencia" value={formatMs(s.line.pingMs)} />
                  {s.line.where ? <DataRow label="Servidor" value={s.line.where} /> : null}
                </>
              ) : (
                <Txt variant="small" tone="muted">
                  {s.lineError ?? 'Sin la conexión con Docker configurada, la Pi no puede medir la línea.'}
                </Txt>
              )}
            </Card>

            {s.phone ? (
              <Card>
                <SectionTitle title={`Este móvil${NET_LABEL[s.net] ? ', ' + NET_LABEL[s.net] : ''}`} />
                <Pair down={s.phone.downMbps} up={s.phone.upMbps} />
                <DataRow label="Latencia" value={formatMs(s.phone.pingMs)} />
                <DataRow label="Jitter" value={formatMs(s.phone.jitterMs)} />
                {s.phone.where ? <DataRow label="Servidor" value={s.phone.where} /> : null}
                <DataRow label="Datos gastados" value={bytes(s.phone.bytes)} />
              </Card>
            ) : null}

            <Card>
              {summary ? <Txt variant="section">{verdict(summary)}</Txt> : null}
              {conclusions.map((c) => (
                <Txt key={c} variant="small" tone="muted">
                  {c}
                </Txt>
              ))}
              <Button title="Repetir la prueba" kind="primary" onPress={start} />
            </Card>
          </>
        ) : null}

        <Pressable
          onPress={() => {
            setDown(contract.downMbps ? String(contract.downMbps) : '')
            setUp(contract.upMbps ? String(contract.upMbps) : '')
            setEditing(true)
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Card>
            <DataRow
              label="Contratado"
              value={contract.downMbps ? `${contract.downMbps} / ${contract.upMbps ?? '?'} Mb/s` : 'Sin poner'}
            />
            <Txt variant="small" tone="faint">
              Toca para cambiarlo. Viene en la factura o en el área de cliente de la operadora.
            </Txt>
          </Card>
        </Pressable>

        <Card>
          <SectionTitle title="Qué es cada cosa" />
          <Txt variant="small" tone="muted">
            Bajada: lo rápido que te llega lo que ves (webs, vídeos, descargas). Subida: lo rápido que sale lo que mandas
            (fotos a la nube, tu cámara en una videollamada).
          </Txt>
          <Txt variant="small" tone="muted">
            Latencia: lo que tarda un mensaje en ir y volver al servidor. Cuanto menos, más al momento responde todo.
          </Txt>
          <Txt variant="small" tone="muted">
            Jitter: cuánto cambia esa latencia de un momento a otro. Si es alto, las videollamadas y los juegos van a
            tirones aunque la velocidad sea buena.
          </Txt>
          <Txt variant="small" tone="muted">
            Datos gastados: lo que ha bajado y subido el móvil para medir. Por WiFi da igual; con datos móviles sale de
            tu tarifa.
          </Txt>
        </Card>
      </ScrollView>

      <Sheet visible={editing} title="Velocidad contratada" onClose={() => setEditing(false)}>
        <Field label="Bajada (Mb/s)" value={down} onChangeText={setDown} keyboardType="number-pad" placeholder="600" />
        <Field label="Subida (Mb/s)" value={up} onChangeText={setUp} keyboardType="number-pad" placeholder="600" />
        <Txt variant="small" tone="faint">
          Déjalo vacío para quitarlo.
        </Txt>
        <Button title="Guardar" kind="primary" onPress={saveContract} />
      </Sheet>
    </Screen>
  )
}

function movilFraction(l: Live): number {
  if (l.stage !== 'movil') return 0
  // Latencia corta; bajada y subida, la mitad del resto cada una.
  return l.phase === 'ping' ? l.fraction * 0.1 : l.phase === 'bajada' ? 0.1 + l.fraction * 0.45 : 0.55 + l.fraction * 0.45
}

/** Bajada y subida en grande, una al lado de otra, como el test de Google. */
function Pair({ down, up, contractDown, contractUp }: { down: number; up: number; contractDown?: number; contractUp?: number }) {
  const palette = usePalette()
  const col = (n: number, label: string, of?: number) => (
    <View style={styles.col}>
      <Txt variant="hero">{big(n)}</Txt>
      <Txt variant="small" tone="muted">
        Mb/s de {label}
      </Txt>
      {of ? (
        <Txt variant="data" tone="faint">
          de {of} ({Math.round((100 * n) / of)} %)
        </Txt>
      ) : null}
    </View>
  )
  return (
    <View style={styles.pair}>
      {col(down, 'bajada', contractDown)}
      <View style={[styles.divider, { backgroundColor: palette.line }]} />
      {col(up, 'subida', contractUp)}
    </View>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl },
  center: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  centerText: { textAlign: 'center' },
  track: { alignSelf: 'stretch', height: space.xs, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  pair: { flexDirection: 'row', alignItems: 'stretch' },
  col: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
})
