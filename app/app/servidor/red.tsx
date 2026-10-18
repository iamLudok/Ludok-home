import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Network from 'expo-network'
import { Screen } from '../../src/ui/Screen'
import { Card, SectionTitle } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Field } from '../../src/ui/Field'
import { Sheet } from '../../src/ui/Sheet'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'
import { useDocker } from '../../src/hooks/useDocker'
import { useDeviceNames } from '../../src/hooks/useData'
import { isRandomMac, setDeviceName } from '../../src/lib/devices'
import { whenFetched } from '../../src/lib/format'
import { groupDevices, nameForGroup, type NetGroup, type NetworkScan } from '../../src/lib/docker/core'

/**
 * Quién está conectado a la red de casa (lo que era /red). Solo se busca al
 * abrir la pantalla o al pedirlo: nada se queda escaneando en la Pi.
 */
export default function Red() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const { api } = useDocker()
  const names = useDeviceNames()
  const [scan, setScan] = useState<NetworkScan | null>(null)
  const [at, setAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<NetGroup | null>(null)
  const [name, setName] = useState('')
  const [myIp, setMyIp] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!api) return
    setLoading(true)
    setError(null)
    try {
      // La IP de este móvil, para reconocerlo en la lista aunque use una MAC
      // inventada. Solo sirve en la WiFi de casa: por Tailscale o con datos
      // móviles la IP es otra y no coincide con ninguna, que es lo correcto.
      Network.getIpAddressAsync().then(setMyIp, () => setMyIp(null))
      setScan(await api.networkScan())
      setAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo escanear la red')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  // Un aparato por fila aunque se vea por el router y por el amplificador.
  const groups = useMemo(() => groupDevices(scan?.devices ?? []), [scan])

  const labelOf = (g: NetGroup): { name: string; named: boolean } => {
    const own = nameForGroup(g, names.data)
    const mine = !!myIp && g.ips.includes(myIp)
    if (own) return { name: mine ? `${own} (este móvil)` : own, named: true }
    if (mine) return { name: 'Este móvil', named: false }
    if (scan?.gateway && g.ips.includes(scan.gateway)) return { name: 'Router', named: false }
    if (g.vendor) return { name: g.vendor, named: false }
    return { name: g.macs.every(isRandomMac) ? 'Probablemente un móvil' : 'Sin nombre', named: false }
  }

  /** Lo que se sabe además del nombre: IPs, fabricante, si pasa por el amplificador. */
  const detailOf = (g: NetGroup) =>
    [
      g.ips.join(', '),
      g.vendor && nameForGroup(g, names.data) ? g.vendor : null,
      g.macs.length > 1 ? 'por el router y el amplificador' : g.macs.every(isRandomMac) ? 'MAC aleatoria' : null,
      g.macs.join(' / '),
    ]
      .filter(Boolean)
      .join(' · ')

  const save = async () => {
    if (!editing) return
    // El nombre se guarda para todas las MAC con que se ha visto el aparato:
    // así lo reconoce entre por el router o por el amplificador.
    for (const mac of editing.macs) await setDeviceName(mac, name)
    setEditing(null)
    toast(name.trim() ? 'Nombre guardado' : 'Nombre quitado')
  }

  const unnamed = groups.filter((g) => !nameForGroup(g, names.data)).length

  return (
    <Screen title="Red de casa" right={<Button title="Volver" kind="ghost" small onPress={() => router.back()} />}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.muted} colors={[palette.fg]} />}
      >
        {error ? (
          <Txt variant="small" tone="danger">
            {error}
          </Txt>
        ) : null}

        <View style={styles.head}>
          <Txt variant="data" tone="faint" style={styles.grow}>
            {loading ? 'Buscando…' : scan && at ? `${groups.length + 1} aparatos, ${whenFetched(at)}` : ''}
          </Txt>
          <Button title="Buscar otra vez" small onPress={load} disabled={loading} />
        </View>

        {scan ? (
          <Card>
            <SectionTitle title="Dispositivos" />
            {scan.self ? (
              <Row title="Raspberry Pi (esta)" sub={scan.self} />
            ) : null}
            {groups.map((g) => {
              const l = labelOf(g)
              return (
                <Pressable
                  key={g.key}
                  onPress={() => {
                    setEditing(g)
                    setName(nameForGroup(g, names.data) ?? '')
                  }}
                  accessibilityRole="button"
                  accessibilityHint="Ponerle nombre"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Row title={l.name} muted={!l.named} sub={detailOf(g)} />
                </Pressable>
              )
            })}
            {unnamed > 0 ? (
              <Txt variant="small" tone="faint">
                Toca un aparato para ponerle nombre. Si va por el amplificador, este le cambia la primera mitad de la MAC y
                la app lo junta con el mismo aparato por el router. Los móviles se inventan una MAC por cada WiFi: si el
                amplificador tiene otro nombre de red, para reconocerlos siempre pon en el móvil «MAC del dispositivo» (o
                «Fija») en las dos redes de casa.
              </Txt>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      <Sheet visible={!!editing} title="Nombre del dispositivo" onClose={() => setEditing(null)}>
        <Txt variant="data" tone="faint">
          {editing ? `${editing.ips.join(', ')} · ${editing.macs.join(' / ')}` : ''}
        </Txt>
        <Field value={name} onChangeText={setName} placeholder="Móvil de Laura, Smart TV…" autoCapitalize="sentences" onSubmitEditing={save} />
        <Txt variant="small" tone="faint">
          Déjalo vacío para quitarle el nombre.
        </Txt>
        <Button title="Guardar" kind="primary" onPress={save} />
      </Sheet>
    </Screen>
  )
}

function Row({ title, sub, muted }: { title: string; sub: string; muted?: boolean }) {
  const palette = usePalette()
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: palette.taken }]} />
      <View style={styles.grow}>
        <Txt variant="body" tone={muted ? 'muted' : 'fg'}>
          {title}
        </Txt>
        <Txt variant="data" tone="faint">
          {sub}
        </Txt>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  grow: { flex: 1, gap: 2 },
})
