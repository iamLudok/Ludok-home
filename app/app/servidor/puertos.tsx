import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '../../src/ui/Screen'
import { Card, DataRow, SectionTitle } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Field } from '../../src/ui/Field'
import { usePalette } from '../../src/ui/ThemeProvider'
import { space } from '../../src/ui/theme'
import { useDocker } from '../../src/hooks/useDocker'
import { hostPorts, isPortFree, nameOf, randomFreePort, type ListeningPort } from '../../src/lib/docker/core'
import type { ContainerSummary } from '../../src/lib/docker/types'

/**
 * Puertos ocupados en la Pi, de quién es cada uno, y comprobar si uno está
 * libre antes de montar algo nuevo. Se ven TODOS los de la Pi (SSH, Tailscale…),
 * no solo los de los contenedores: ver deploy/docker-api.
 */
export default function Puertos() {
  const router = useRouter()
  const palette = usePalette()
  const { api } = useDocker()
  const [used, setUsed] = useState<ListeningPort[] | null>(null)
  const [containers, setContainers] = useState<ContainerSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [random, setRandom] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!api) return
    setLoading(true)
    setError(null)
    try {
      const [ports, list] = await Promise.all([api.listeningPorts(), api.list()])
      setUsed(ports)
      setContainers(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer los puertos')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  /** De qué contenedor es cada puerto publicado. */
  const owner = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of containers) for (const p of hostPorts(c)) m.set(`${p.proto}/${p.host}`, nameOf(c))
    return m
  }, [containers])

  // Una fila por puerto y protocolo: la misma escucha en IPv4, IPv6 y en la IP
  // de Tailscale es el mismo puerto ocupado.
  const rows = useMemo(() => {
    const seen = new Map<string, ListeningPort[]>()
    for (const u of used ?? []) {
      const key = `${u.proto}/${u.port}`
      seen.set(key, [...(seen.get(key) ?? []), u])
    }
    return [...seen.entries()].map(([key, list]) => ({
      key,
      port: list[0].port,
      proto: list[0].proto,
      onlyLocal: list.every((u) => u.address === '127.0.0.1' || u.address === '::1'),
      owner: owner.get(key),
    }))
  }, [used, owner])

  const asked = Number(query)
  const valid = Number.isInteger(asked) && asked > 0 && asked < 65536

  return (
    <Screen title="Puertos" right={<Button title="Volver" kind="ghost" small onPress={() => router.back()} />}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.muted} colors={[palette.fg]} />}
      >
        {error ? (
          <Txt variant="small" tone="danger">
            {error}
          </Txt>
        ) : null}

        <Card>
          <SectionTitle title="¿Está libre?" />
          <View style={styles.row}>
            <Field value={query} onChangeText={setQuery} placeholder="8090" keyboardType="number-pad" />
          </View>
          {used && query ? (
            <Txt variant="small" tone={!valid ? 'danger' : isPortFree(asked, used) ? 'muted' : 'warn'}>
              {!valid
                ? 'Eso no es un puerto (1-65535).'
                : isPortFree(asked, used)
                  ? `El ${asked} está libre en la Pi${isPortFree(asked, used, 'udp') ? '' : ' (en udp no)'}.`
                  : `El ${asked} está ocupado${owner.get(`tcp/${asked}`) ? ` por ${owner.get(`tcp/${asked}`)}` : ''}.`}
            </Txt>
          ) : null}
          <Button title="Dame uno libre" small onPress={() => used && setRandom(randomFreePort(used))} disabled={!used} style={styles.selfStart} />
          {random ? (
            <Txt variant="section" selectable>
              {random}
            </Txt>
          ) : null}
        </Card>

        <Card>
          <SectionTitle title={used ? `Ocupados (${rows.length})` : 'Ocupados'} />
          {!used ? (
            <Txt variant="small" tone="muted">
              Cargando…
            </Txt>
          ) : (
            rows.map((r) => (
              <DataRow
                key={r.key}
                label={`${r.port}${r.proto === 'udp' ? ' udp' : ''}`}
                value={[r.owner ?? 'la Pi', r.onlyLocal ? 'solo local' : null].filter(Boolean).join(' · ')}
              />
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl },
  row: { flexDirection: 'row', gap: space.sm },
  selfStart: { alignSelf: 'flex-start' },
})
