import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen, Empty } from '../../src/ui/Screen'
import { Card, SectionTitle } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Tick } from '../../src/ui/Tick'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'
import { StateBadge } from '../../src/components/StateBadge'
import { PiStats } from '../../src/components/PiStats'
import { useDocker } from '../../src/hooks/useDocker'
import { readCache, writeCache } from '../../src/lib/cache'
import {
  diffSnapshots,
  groupByProject,
  hostReadings,
  hostPorts,
  nameOf,
  needsAttention,
  riskOf,
  SELF_NAME,
  snapshotOf,
  stateOf,
  type ChangeEvent,
  type HostReading,
  type Snapshot,
  type UpdateState,
} from '../../src/lib/docker/core'
import type { ContainerInspect, ContainerSummary } from '../../src/lib/docker/types'

const SNAPSHOT_KEY = 'docker-snapshot'

const EVENT_LABEL: Record<ChangeEvent['kind'], string> = {
  parado: 'se ha parado',
  arrancado: 'ha arrancado',
  reiniciado: 'se ha reiniciado',
  nuevo: 'es nuevo',
  eliminado: 'ya no está',
  imagen: 'ha cambiado de imagen',
}

const UPDATE_LABEL: Partial<Record<UpdateState, string>> = {
  disponible: 'Hay versión nueva',
  descargada: 'Nueva descargada, sin aplicar',
}

/**
 * Todos los contenedores de la Pi, agrupados por proyecto. Sustituye al bot de
 * Docker de Telegram: lo que él avisaba solo (caídas, actualizaciones) aquí se
 * ve al abrir la pantalla, en «Desde la última vez».
 */
export default function Servidor() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const { api, ready } = useDocker()
  const [list, setList] = useState<ContainerSummary[] | null>(null)
  const [changes, setChanges] = useState<ChangeEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [updates, setUpdates] = useState<Record<string, UpdateState>>({})
  const [checking, setChecking] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [pi, setPi] = useState<HostReading[] | null>(null)

  const load = useCallback(async () => {
    if (!api) return
    setLoading(true)
    setError(null)
    try {
      // El estado de la Pi va por su cuenta: si tarda o falla, la lista no espera.
      api.hostStats().then((s) => setPi(hostReadings(s)), () => setPi(null))
      const containers = await api.list()
      setList(containers)
      // Cambios desde la última vez que se abrió la pantalla: es lo que en el
      // bot llegaba como aviso suelto.
      const inspects: ContainerInspect[] = await Promise.all(containers.map((c) => api.inspect(c.Id)))
      const now = snapshotOf(inspects)
      const before = (await readCache<Snapshot>(SNAPSHOT_KEY))?.value ?? null
      setChanges(diffSnapshots(before, now))
      await writeCache(SNAPSHOT_KEY, now)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hablar con Docker')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => (list ? groupByProject(list) : []), [list])
  const attention = (list ?? []).filter((c) => needsAttention(stateOf(c)))

  const checkUpdates = async () => {
    if (!api || !list) return
    setChecking(true)
    const out: Record<string, UpdateState> = {}
    // De tres en tres: preguntar a la vez por once imágenes a Docker Hub y a
    // ghcr satura la Pi y algún registro responde con «demasiadas peticiones».
    for (let i = 0; i < list.length; i += 3) {
      await Promise.all(
        list.slice(i, i + 3).map(async (c) => {
          try {
            out[nameOf(c)] = (await api.checkUpdate(await api.inspect(c.Id))).state
          } catch {
            out[nameOf(c)] = 'desconocida'
          }
        }),
      )
    }
    setUpdates(out)
    setChecking(false)
    const n = Object.values(out).filter((s) => s === 'disponible' || s === 'descargada').length
    toast(n ? `${n} con actualización` : 'Todo al día')
  }

  const toggle = (name: string) => {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelected(next)
  }

  const bulk = (action: 'start' | 'stop' | 'restart') => {
    if (!api || selected.size === 0) return
    const names = [...selected]
    const label = { start: 'Arrancar', stop: 'Parar', restart: 'Reiniciar' }[action]
    const risks = action === 'start' ? [] : names.map(riskOf).filter(Boolean)
    if (action !== 'start' && names.includes(SELF_NAME)) {
      Alert.alert('No se puede', `«${SELF_NAME}» es la puerta de la API: si lo paras, la app pierde el acceso. Quítalo de la selección.`)
      return
    }
    Alert.alert(`${label} ${names.length}`, [names.join(', '), ...risks].join('\n\n'), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: label,
        style: action === 'start' ? 'default' : 'destructive',
        onPress: async () => {
          setBusy(label)
          const failed: string[] = []
          for (const n of names) {
            try {
              await api[action](n)
            } catch {
              failed.push(n)
            }
          }
          setBusy(null)
          setSelected(new Set())
          setSelecting(false)
          toast(failed.length ? `Falló en: ${failed.join(', ')}` : 'Hecho')
          load()
        },
      },
    ])
  }

  if (!ready) return <Screen title="Servidor">{null}</Screen>

  if (!api) {
    return (
      <Screen title="Servidor" right={<Button title="Volver" kind="ghost" small onPress={() => router.back()} />}>
        <Empty text="Configura la conexión con Docker de la Pi en Ajustes (dirección y contraseña).">
          <Button title="Ir a Ajustes" kind="primary" onPress={() => router.navigate('/ajustes')} />
          {/* El test de internet no necesita Docker: que se pueda usar igual. */}
          <Button title="Test de velocidad" onPress={() => router.navigate('/servidor/velocidad')} />
        </Empty>
      </Screen>
    )
  }

  return (
    <Screen
      title="Servidor"
      right={
        <Button
          title={selecting ? 'Listo' : 'Seleccionar'}
          kind="ghost"
          small
          onPress={() => {
            setSelecting(!selecting)
            setSelected(new Set())
          }}
        />
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.muted} colors={[palette.fg]} />}
      >
        {error ? (
          <Card>
            <Txt variant="section" tone="danger">
              No hay conexión con Docker
            </Txt>
            <Txt variant="small" tone="muted">
              {error}
            </Txt>
            <Button title="Reintentar" small onPress={load} style={styles.selfStart} />
          </Card>
        ) : null}

        {pi ? (
          <Card>
            <SectionTitle
              title="La Pi"
              right={<Button title="Red de casa" kind="ghost" small onPress={() => router.navigate('/servidor/red')} />}
            />
            <PiStats readings={pi} />
          </Card>
        ) : null}

        {changes.length > 0 || attention.length > 0 ? (
          <Card>
            <SectionTitle title="Desde la última vez" />
            {attention.map((c) => (
              <Txt key={`a-${c.Id}`} variant="small" tone="warn">
                {nameOf(c)}: {stateOf(c).health === 'mal' ? 'dice que está enfermo' : 'se está reiniciando o está muerto'}
              </Txt>
            ))}
            {changes.map((e) => (
              <Txt key={`${e.name}-${e.kind}`} variant="small" tone={e.kind === 'parado' || e.kind === 'eliminado' ? 'warn' : 'muted'}>
                {e.name} {EVENT_LABEL[e.kind]}
              </Txt>
            ))}
          </Card>
        ) : null}

        {api.via ? (
          <Txt variant="data" tone="faint">
            Conectado por {api.via === 'casa' ? 'la WiFi de casa' : 'Tailscale'}
          </Txt>
        ) : null}

        <View style={styles.tools}>
          <Button title={checking ? 'Buscando…' : 'Buscar actualizaciones'} small onPress={checkUpdates} disabled={checking || !list} />
          <Button title="Puertos" small onPress={() => router.navigate('/servidor/puertos')} />
          <Button title="Limpieza" small onPress={() => router.navigate('/servidor/limpieza')} />
          <Button title="Velocidad" small onPress={() => router.navigate('/servidor/velocidad')} />
        </View>

        {selecting ? (
          <Card>
            <Txt variant="small" tone="muted">
              {selected.size ? `${selected.size} seleccionados` : 'Toca los contenedores que quieras.'}
            </Txt>
            <View style={styles.tools}>
              <Button title="Arrancar" small onPress={() => bulk('start')} disabled={!selected.size || !!busy} />
              <Button title="Reiniciar" small onPress={() => bulk('restart')} disabled={!selected.size || !!busy} />
              <Button title="Parar" kind="danger" small onPress={() => bulk('stop')} disabled={!selected.size || !!busy} />
            </View>
            {busy ? (
              <Txt variant="data" tone="faint">
                {busy}…
              </Txt>
            ) : null}
          </Card>
        ) : null}

        {list === null && !error ? (
          <Txt variant="small" tone="muted">
            Cargando…
          </Txt>
        ) : null}

        {groups.map((g) => (
          <View key={g.project ?? '_sueltos'} style={styles.group}>
            <SectionTitle title={g.project ?? 'Sin compose'} />
            {g.containers.map((c) => {
              const name = nameOf(c)
              const st = stateOf(c)
              const upd = updates[name] ? UPDATE_LABEL[updates[name]] : undefined
              const ports = hostPorts(c)
              return (
                <Pressable
                  key={c.Id}
                  onPress={() => (selecting ? toggle(name) : router.navigate({ pathname: '/servidor/[name]', params: { name } }))}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, { backgroundColor: palette.surface, borderColor: palette.line, opacity: pressed ? 0.7 : 1 }]}
                >
                  {selecting ? <Tick on={selected.has(name)} onPress={() => toggle(name)} label={`Seleccionar ${name}`} /> : null}
                  <View style={styles.rowText}>
                    <Txt variant="body" numberOfLines={1}>
                      {name}
                    </Txt>
                    <StateBadge state={st} />
                    {ports.length ? (
                      <Txt variant="data" tone="faint" numberOfLines={1}>
                        {ports.map((p) => `${p.host}${p.proto === 'udp' ? '/udp' : ''}`).join(', ')}
                      </Txt>
                    ) : null}
                    {upd ? (
                      <Txt variant="data" tone="warn">
                        {upd}
                      </Txt>
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        ))}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  group: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
  },
  rowText: { flex: 1, gap: 3 },
  selfStart: { alignSelf: 'flex-start' },
})
