import { useCallback, useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Screen } from '../../src/ui/Screen'
import { Card, DataRow, SectionTitle } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Chips } from '../../src/ui/Chips'
import { Field } from '../../src/ui/Field'
import { Sheet } from '../../src/ui/Sheet'
import { useToast } from '../../src/ui/Toast'
import { space, type } from '../../src/ui/theme'
import { StateBadge } from '../../src/components/StateBadge'
import { useDocker } from '../../src/hooks/useDocker'
import { composeYaml, imageVersion, parseImageRef, refWithTag, riskOf, SELF_NAME, stateFromInspect, type UpdateState } from '../../src/lib/docker/core'
import type { ContainerInspect, ImageLikeConfig } from '../../src/lib/docker/types'

type Tab = 'info' | 'logs' | 'comando' | 'compose'
const TABS = [
  { key: 'info' as const, label: 'Info' },
  { key: 'logs' as const, label: 'Logs' },
  { key: 'comando' as const, label: 'Comando' },
  { key: 'compose' as const, label: 'Compose' },
]

const UPDATE_TEXT: Record<UpdateState, string> = {
  'al-dia': 'Al día',
  disponible: 'Hay una versión nueva publicada',
  descargada: 'La nueva ya está descargada, falta aplicarla',
  fijada: 'Fijada a una versión concreta (digest): no se actualiza',
  desconocida: 'No se ha podido comprobar',
}

async function shareText(filename: string, content: string, title: string) {
  const file = new File(Paths.cache, filename)
  file.create({ overwrite: true })
  file.write(content)
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: title })
  }
}

export default function Contenedor() {
  const { name } = useLocalSearchParams<{ name: string }>()
  const router = useRouter()
  const toast = useToast()
  const { api } = useDocker()
  const [c, setC] = useState<ContainerInspect | null>(null)
  const [imageCfg, setImageCfg] = useState<ImageLikeConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('info')
  const [busy, setBusy] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [tagSheet, setTagSheet] = useState(false)
  const [newTag, setNewTag] = useState('')

  const [logs, setLogs] = useState<string | null>(null)
  const [tail, setTail] = useState<'100' | '500'>('100')
  const [cmd, setCmd] = useState('')
  const [out, setOut] = useState<{ output: string; exitCode: number | null } | null>(null)

  const load = useCallback(async () => {
    if (!api || !name) return
    setError(null)
    try {
      const info = await api.inspect(name)
      setC(info)
      setImageCfg((await api.image(info.Image))?.Config ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar')
    }
  }, [api, name])

  useEffect(() => {
    load()
  }, [load])

  const loadLogs = useCallback(async () => {
    if (!api || !name) return
    setLogs(null)
    try {
      setLogs((await api.logs(name, Number(tail))) || '(sin logs)')
    } catch (e) {
      setLogs(e instanceof Error ? e.message : 'No se pudieron leer los logs')
    }
  }, [api, name, tail])

  useEffect(() => {
    if (tab === 'logs') loadLogs()
  }, [tab, loadLogs])

  if (!api) return <Screen title={name ?? ''}>{null}</Screen>

  const self = name === SELF_NAME
  const risk = name ? riskOf(name) : null

  const run = async (label: string, fn: () => Promise<void>, done = 'Hecho') => {
    setBusy(label)
    try {
      await fn()
      toast(done)
    } catch (e) {
      Alert.alert(label, e instanceof Error ? e.message : 'Algo ha fallado')
    } finally {
      setBusy(null)
      load()
    }
  }

  const confirm = (title: string, body: string, action: string, fn: () => void) =>
    Alert.alert(title, [body, risk].filter(Boolean).join('\n\n'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: action, style: 'destructive', onPress: fn },
    ])

  const doUpdate = (ref?: string) => {
    if (!c) return
    const target = ref ?? c.Config.Image ?? ''
    confirm(
      ref ? `Cambiar a ${target}` : 'Actualizar',
      `Se descarga ${target}, se para el contenedor y se crea de nuevo con la misma configuración. Si el nuevo no aguanta en pie, vuelve el de antes.`,
      ref ? 'Cambiar' : 'Actualizar',
      () =>
        run('Actualizando', () => api.update(name!, ref, (step) => setBusy(step)), 'Actualizado'),
    )
  }

  const checkUpdate = async () => {
    if (!c) return
    setBusy('Comprobando')
    try {
      setUpdate((await api.checkUpdate(c)).state)
    } catch {
      setUpdate('desconocida')
    } finally {
      setBusy(null)
    }
  }

  const exec = async () => {
    if (!cmd.trim()) return
    setBusy('Ejecutando')
    setOut(null)
    try {
      setOut(await api.exec(name!, cmd))
    } catch (e) {
      setOut({ output: e instanceof Error ? e.message : 'No se pudo ejecutar', exitCode: null })
    } finally {
      setBusy(null)
    }
  }

  const st = c ? stateFromInspect(c) : null
  const version = imageVersion(c?.Config) ?? imageVersion(imageCfg)
  const envNames = (c?.Config.Env ?? []).map((e) => e.split('=')[0])
  const imageEnv = new Set((imageCfg?.Env ?? []).map((e) => e.split('=')[0]))
  const ownEnv = envNames.filter((n) => !imageEnv.has(n))

  return (
    <Screen title={name ?? ''} right={<Button title="Volver" kind="ghost" small onPress={() => router.back()} />}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <Txt variant="small" tone="danger">
            {error}
          </Txt>
        ) : null}

        {c && st ? (
          <Card>
            <StateBadge state={st} />
            <Txt variant="small" tone="muted">
              {c.Config.Image}
              {version ? ` · versión ${version}` : ''}
            </Txt>
            {self ? (
              <Txt variant="small" tone="warn">
                Es la puerta por la que la app habla con Docker. Para no cortarte el acceso, aquí solo se puede mirar.
              </Txt>
            ) : (
              <View style={styles.actions}>
                {c.State.Running ? (
                  <>
                    <Button title="Reiniciar" small disabled={!!busy} onPress={() => run('Reiniciar', () => api.restart(name!))} />
                    <Button title="Parar" small kind="danger" disabled={!!busy} onPress={() => confirm('Parar', name!, 'Parar', () => run('Parar', () => api.stop(name!)))} />
                  </>
                ) : (
                  <Button title="Arrancar" small kind="primary" disabled={!!busy} onPress={() => run('Arrancar', () => api.start(name!))} />
                )}
                <Button title="¿Hay versión nueva?" small disabled={!!busy} onPress={checkUpdate} />
                <Button title="Actualizar" small disabled={!!busy} onPress={() => doUpdate()} />
                <Button
                  title="Cambiar versión"
                  small
                  disabled={!!busy}
                  onPress={() => {
                    setNewTag(parseImageRef(c.Config.Image ?? '').tag)
                    setTagSheet(true)
                  }}
                />
                <Button
                  title="Eliminar"
                  small
                  kind="danger"
                  disabled={!!busy}
                  onPress={() =>
                    confirm('Eliminar el contenedor', `Se borra ${name}. Sus volúmenes con nombre se quedan; para volver a tenerlo hay que crearlo otra vez (el Compose de aquí sirve).`, 'Eliminar', () =>
                      run('Eliminar', async () => {
                        await api.remove(name!)
                        router.back()
                      }, 'Eliminado'),
                    )
                  }
                />
              </View>
            )}
            {update ? (
              <Txt variant="small" tone={update === 'disponible' || update === 'descargada' ? 'warn' : 'muted'}>
                {UPDATE_TEXT[update]}
              </Txt>
            ) : null}
            {busy ? (
              <Txt variant="data" tone="faint">
                {busy}…
              </Txt>
            ) : null}
          </Card>
        ) : null}

        <Chips options={TABS} value={tab} onChange={setTab} />

        {tab === 'info' && c ? (
          <Card>
            <DataRow label="Creado" value={c.Created.slice(0, 10)} />
            <DataRow label="Arrancado" value={c.State.StartedAt.slice(0, 16).replace('T', ' ')} />
            <DataRow label="Reinicios" value={String(c.RestartCount)} />
            <DataRow label="Reinicio automático" value={c.HostConfig.RestartPolicy?.Name || 'no'} />
            <DataRow label="Red" value={c.HostConfig.NetworkMode ?? '-'} />
            {c.State.Running ? null : <DataRow label="Código de salida" value={String(c.State.ExitCode)} />}
            <SectionTitle title="Puertos" />
            {Object.entries(c.HostConfig.PortBindings ?? {}).length === 0 ? (
              <Txt variant="small" tone="faint">
                Ninguno publicado
              </Txt>
            ) : (
              Object.entries(c.HostConfig.PortBindings ?? {}).map(([k, v]) => (
                <DataRow key={k} label={k} value={(v ?? []).map((b) => `${b.HostIp ? b.HostIp + ':' : ''}${b.HostPort}`).join(', ')} />
              ))
            )}
            <SectionTitle title="Volúmenes" />
            {c.Mounts.length === 0 ? (
              <Txt variant="small" tone="faint">
                Ninguno
              </Txt>
            ) : (
              c.Mounts.map((m) => (
                <Txt key={m.Destination} variant="mono" tone="muted">
                  {(m.Type === 'volume' ? m.Name : m.Source) ?? ''} → {m.Destination}
                  {m.RW ? '' : ' (solo lectura)'}
                </Txt>
              ))
            )}
            <SectionTitle title="Redes" />
            <Txt variant="small" tone="muted">
              {Object.keys(c.NetworkSettings.Networks ?? {}).join(', ') || '-'}
            </Txt>
            <SectionTitle title={`Variables tuyas (${ownEnv.length})`} />
            <Txt variant="small" tone="muted">
              {ownEnv.join(', ') || 'Ninguna'}
            </Txt>
            <Txt variant="data" tone="faint">
              Solo los nombres: los valores pueden ser contraseñas. Están completos en la pestaña Compose.
            </Txt>
          </Card>
        ) : null}

        {tab === 'logs' ? (
          <Card>
            <View style={styles.actions}>
              <Chips options={[{ key: '100' as const, label: '100 líneas' }, { key: '500' as const, label: '500' }]} value={tail} onChange={setTail} />
            </View>
            <View style={styles.actions}>
              <Button title="Recargar" small onPress={loadLogs} />
              <Button title="Compartir como fichero" small disabled={!logs} onPress={() => logs && shareText(`${name}-logs.txt`, logs, `Logs de ${name}`)} />
            </View>
            <Txt variant="mono" selectable>
              {logs ?? 'Cargando…'}
            </Txt>
          </Card>
        ) : null}

        {tab === 'comando' ? (
          <Card>
            <Txt variant="small" tone="muted">
              Se ejecuta con sh dentro del contenedor y espera a que acabe. Para comandos cortos: no es una terminal
              interactiva.
            </Txt>
            <Field value={cmd} onChangeText={setCmd} placeholder="df -h" autoCapitalize="none" autoCorrect={false} onSubmitEditing={exec} style={styles.mono} />
            <View style={styles.actions}>
              <Button title="Ejecutar" kind="primary" small onPress={exec} disabled={!cmd.trim() || !!busy || !c?.State.Running} />
              {['df -h', 'ls -la', 'ps', 'uptime'].map((s) => (
                <Button key={s} title={s} kind="ghost" small onPress={() => setCmd(s)} />
              ))}
            </View>
            {!c?.State.Running ? (
              <Txt variant="small" tone="faint">
                Tiene que estar en marcha para ejecutar algo dentro.
              </Txt>
            ) : null}
            {out ? (
              <>
                <Txt variant="data" tone={out.exitCode === 0 ? 'muted' : 'warn'}>
                  {out.exitCode === null ? 'Sin código de salida' : `Código de salida ${out.exitCode}`}
                </Txt>
                <Txt variant="mono" selectable>
                  {out.output || '(sin salida)'}
                </Txt>
              </>
            ) : null}
          </Card>
        ) : null}

        {tab === 'compose' && c ? (
          <Card>
            <Txt variant="small" tone="warn">
              Lleva tus variables tal cual, contraseñas incluidas. Cuidado al compartirlo.
            </Txt>
            <Button title="Compartir como fichero" small onPress={() => shareText(`${name}-docker-compose.yml`, composeYaml(c, imageCfg), `Compose de ${name}`)} style={styles.selfStart} />
            <Txt variant="mono" selectable>
              {composeYaml(c, imageCfg)}
            </Txt>
          </Card>
        ) : null}
      </ScrollView>

      <Sheet visible={tagSheet} title="Cambiar de versión" onClose={() => setTagSheet(false)}>
        <Txt variant="small" tone="muted">
          Para volver a una versión anterior (rollback) o pasar a otra concreta. Escribe la etiqueta tal como sale en Docker
          Hub o en la página de la imagen.
        </Txt>
        <Field label="Etiqueta" value={newTag} onChangeText={setNewTag} autoCapitalize="none" autoCorrect={false} placeholder="latest" />
        <Txt variant="data" tone="faint">
          Quedará: {c ? refWithTag(c.Config.Image ?? '', newTag.trim() || 'latest') : ''}
        </Txt>
        <Button
          title="Cambiar"
          kind="primary"
          disabled={!newTag.trim()}
          onPress={() => {
            setTagSheet(false)
            if (c) doUpdate(refWithTag(c.Config.Image ?? '', newTag.trim()))
          }}
        />
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  selfStart: { alignSelf: 'flex-start' },
  mono: { fontFamily: type.mono.fontFamily },
})
