import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '../../src/ui/Screen'
import { Card, DataRow } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { space } from '../../src/ui/theme'
import { useDocker } from '../../src/hooks/useDocker'
import { bytes } from '../../src/lib/format'
import { classifyUnusedImages, type CleanupImage, type ImageGroup } from '../../src/lib/docker/core'
import type { DiskUsage } from '../../src/lib/docker/types'

const GROUPS: Record<ImageGroup, { title: string; body: string; button?: string }> = {
  vieja: {
    title: 'Versiones viejas de lo que usas',
    body: 'Cada actualización deja la imagen de antes en la Pi. Ya no las usa nadie: se pueden borrar sin problema.',
    button: 'Borrar las versiones viejas',
  },
  'sin-uso': {
    title: 'De apps que ya no tienes en marcha',
    body: 'Ningún contenedor las usa. Borrar la imagen no borra los datos de la app (siguen en sus carpetas); si la vuelves a levantar, Docker la descarga otra vez.',
    button: 'Borrar las de apps que no usas',
  },
  pendiente: {
    title: 'Actualizaciones descargadas sin aplicar',
    body: 'La versión nueva de algo que usas, ya descargada. No se borran: se aplican al actualizar ese contenedor en Servidor, y entonces la de antes pasa a «viejas».',
  },
}

type OtherKind = 'containers' | 'volumes' | 'build' | 'networks'

const OTHERS: Record<OtherKind, { title: string; body: string }> = {
  containers: { title: 'Contenedores parados', body: 'Los que están parados se borran. Sus volúmenes con nombre se quedan.' },
  volumes: {
    title: 'Volúmenes anónimos sin usar',
    body: 'Solo los que no tienen nombre y no usa nadie. Los que tienen nombre (bases de datos de un compose parado) NO se tocan.',
  },
  build: { title: 'Caché de compilación', body: 'Lo que queda de hacer docker build. Se regenera si vuelves a compilar.' },
  networks: { title: 'Redes sin usar', body: 'Redes que no tienen ningún contenedor conectado.' },
}

function otherSizes(df: DiskUsage): Record<OtherKind, number | null> {
  return {
    containers: (df.Containers ?? []).filter((c) => c.State !== 'running').reduce((n, c) => n + (c.SizeRw ?? 0), 0),
    volumes: (df.Volumes ?? []).filter((v) => v.UsageData?.RefCount === 0).reduce((n, v) => n + Math.max(0, v.UsageData?.Size ?? 0), 0),
    build: (df.BuildCache ?? []).filter((b) => !b.InUse).reduce((n, b) => n + b.Size, 0),
    networks: null,
  }
}

const total = (xs: CleanupImage[]) => xs.reduce((n, x) => n + x.reclaim, 0)

export default function Limpieza() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const { api } = useDocker()
  const [df, setDf] = useState<DiskUsage | null>(null)
  const [images, setImages] = useState<CleanupImage[] | null>(null)
  const [open, setOpen] = useState<ImageGroup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!api) return
    setLoading(true)
    setError(null)
    try {
      const [usage, list] = await Promise.all([api.diskUsage(), api.list()])
      // La imagen que pide cada contenedor (su etiqueta), no la que usa: es lo
      // que distingue «vieja» de «actualización descargada sin aplicar».
      const refs = await Promise.all(list.map(async (c) => (await api.inspect(c.Id)).Config.Image ?? ''))
      setDf(usage)
      setImages(classifyUnusedImages(usage.Images ?? [], refs))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el uso de disco')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const byGroup = useMemo(() => {
    const out: Record<ImageGroup, CleanupImage[]> = { vieja: [], 'sin-uso': [], pendiente: [] }
    for (const i of images ?? []) out[i.group].push(i)
    return out
  }, [images])

  const deleteGroup = (group: ImageGroup) => {
    if (!api) return
    const xs = byGroup[group]
    Alert.alert(GROUPS[group].button!, `${xs.length} imágenes, hasta ${bytes(total(xs))}.\n\nNo se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          let done = 0
          const failed: string[] = []
          for (const img of xs) {
            setBusy(`Borrando ${done + 1} de ${xs.length}…`)
            try {
              await api.removeImage(img.id)
            } catch {
              failed.push(img.label)
            }
            done++
          }
          setBusy(null)
          toast(failed.length ? `No se pudieron borrar ${failed.length}` : `Borradas ${done}`)
          load()
        },
      },
    ])
  }

  const prune = (kind: OtherKind) => {
    if (!api) return
    Alert.alert(`Limpiar: ${OTHERS[kind].title.toLowerCase()}`, `${OTHERS[kind].body}\n\nNo se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpiar',
        style: 'destructive',
        onPress: async () => {
          setBusy('Limpiando… (puede tardar)')
          try {
            const freed = await api.prune(kind)
            toast(freed ? `Liberado ${bytes(freed)}` : 'Hecho, no había nada')
          } catch (e) {
            Alert.alert('Limpieza', e instanceof Error ? e.message : 'Ha fallado')
          } finally {
            setBusy(null)
            load()
          }
        },
      },
    ])
  }

  const sizes = df ? otherSizes(df) : null

  return (
    <Screen title="Limpieza" right={<Button title="Volver" kind="ghost" small onPress={() => router.back()} />}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.muted} colors={[palette.fg]} />}
      >
        {error ? (
          <Txt variant="small" tone="danger">
            {error}
          </Txt>
        ) : null}
        {busy ? (
          <Txt variant="small" tone="muted">
            {busy}
          </Txt>
        ) : null}

        {(['vieja', 'sin-uso', 'pendiente'] as const).map((group) => {
          const xs = byGroup[group]
          return (
            <Card key={group}>
              <DataRow label={GROUPS[group].title} value={images ? `${xs.length} · ${bytes(total(xs))}` : '…'} strong />
              <Txt variant="small" tone="muted">
                {GROUPS[group].body}
              </Txt>
              {xs.length > 0 ? (
                <Pressable onPress={() => setOpen(open === group ? null : group)} accessibilityRole="button" hitSlop={6}>
                  <Txt variant="small" style={styles.bold}>
                    {open === group ? 'Ocultar cuáles' : 'Ver cuáles'}
                  </Txt>
                </Pressable>
              ) : null}
              {open === group ? (
                <View style={styles.list}>
                  {xs.map((x) => (
                    <DataRow key={x.id} label={x.label} value={bytes(x.reclaim)} />
                  ))}
                </View>
              ) : null}
              {GROUPS[group].button && xs.length > 0 ? (
                <Button title={GROUPS[group].button!} small kind="danger" onPress={() => deleteGroup(group)} disabled={!!busy} style={styles.selfStart} />
              ) : null}
            </Card>
          )
        })}

        {(Object.keys(OTHERS) as OtherKind[]).map((kind) => (
          <Card key={kind}>
            <DataRow label={OTHERS[kind].title} value={sizes ? (sizes[kind] === null ? '' : bytes(sizes[kind]!)) : '…'} strong />
            <Txt variant="small" tone="muted">
              {OTHERS[kind].body}
            </Txt>
            <Button title="Limpiar" small kind="danger" onPress={() => prune(kind)} disabled={!!busy} style={styles.selfStart} />
          </Card>
        ))}

        <Txt variant="data" tone="faint" style={styles.center}>
          Lo que se libera es aproximado: dos imágenes que comparten capas solo liberan esas capas cuando se borran las dos.
        </Txt>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl },
  list: { gap: space.xs },
  bold: { fontWeight: '600' },
  selfStart: { alignSelf: 'flex-start' },
  center: { textAlign: 'center' },
})
