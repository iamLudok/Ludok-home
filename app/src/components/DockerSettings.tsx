import { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useSettings } from '../hooks/useSettings'
import { updateSettings } from '../lib/settings'
import { dockerApi, dockerConfigFrom } from '../lib/docker/client'
import { Card } from '../ui/Card'
import { Field } from '../ui/Field'
import { Txt } from '../ui/Text'
import { Button } from '../ui/Button'
import { space } from '../ui/theme'

/**
 * Conexión con Docker de la Pi para la pantalla Servidor. La contraseña es la
 * del Caddy de deploy/docker-api: quien la tiene controla Docker entero, así
 * que no viaja en las copias de seguridad.
 */
export function DockerSettings() {
  const settings = useSettings()
  const [url, setUrl] = useState('')
  const [lanUrl, setLanUrl] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => setUrl(settings.dockerUrl ?? ''), [settings.dockerUrl])
  useEffect(() => setLanUrl(settings.dockerLanUrl ?? ''), [settings.dockerLanUrl])
  useEffect(() => setUser(settings.dockerUser ?? ''), [settings.dockerUser])
  useEffect(() => setPassword(settings.dockerPassword ?? ''), [settings.dockerPassword])

  const config = dockerConfigFrom({ dockerUrl: url, dockerLanUrl: lanUrl, dockerUser: user, dockerPassword: password })

  const save = async () => {
    await updateSettings({ dockerUrl: url.trim(), dockerLanUrl: lanUrl.trim(), dockerUser: user.trim() || 'ludok', dockerPassword: password })
    setStatus({ ok: true, text: 'Guardado.' })
  }

  const probe = async () => {
    if (!config) return
    setBusy(true)
    setStatus(null)
    try {
      const api = dockerApi(config)
      const v = await api.version()
      await save()
      setStatus({ ok: true, text: `Conecta por ${api.via === 'casa' ? 'la WiFi de casa' : 'Tailscale'}: Docker ${v.Version} en ${v.Os}/${v.Arch}.` })
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : 'No se pudo conectar' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <Txt variant="title">Docker de la Pi</Txt>
      <Txt variant="small" tone="muted">
        Para la pantalla Servidor. Primero prueba por Tailscale y, si no responde, por la WiFi de casa. Fuera de casa
        hace falta Tailscale.
      </Txt>
      <Field label="Por Tailscale" value={url} onChangeText={setUrl} placeholder="http://100.x.x.x:2375" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Field
        label="En casa, sin Tailscale (opcional)"
        value={lanUrl}
        onChangeText={setLanUrl}
        placeholder="http://192.168.1.x:2375"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        hint="Por la WiFi va sin cifrar: alguien en tu misma red podría ver la contraseña. Por Tailscale va cifrado."
      />
      <Field value={user} onChangeText={setUser} placeholder="Usuario (ludok)" autoCapitalize="none" autoCorrect={false} />
      <Field value={password} onChangeText={setPassword} placeholder="Contraseña" autoCapitalize="none" autoCorrect={false} secureTextEntry />
      <View style={styles.actions}>
        <Button title="Guardar" kind="primary" small onPress={save} disabled={busy} />
        <Button title="Probar conexión" small onPress={probe} disabled={!config || busy} />
      </View>
      {status ? (
        <Txt variant="small" tone={status.ok ? 'muted' : 'danger'}>
          {status.text}
        </Txt>
      ) : null}
      <Txt variant="small" tone="faint">
        Esta contraseña da control total de Docker, que es casi ser administrador de la Pi. No se incluye en las copias.
      </Txt>
    </Card>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
