// El cliente de Docker de la app, con el `fetch` de Expo: el de React Native no
// deja leer la respuesta como bytes, y los logs y la salida de exec llegan en
// binario. Separado de `api.ts` para que aquel siga sin nada nativo.
import { fetch } from 'expo/fetch'
import { DockerApi, type DockerConfig } from './api'
import type { Settings } from '../../types'

export function dockerConfigFrom(
  s: Pick<Settings, 'dockerUrl' | 'dockerLanUrl' | 'dockerUser' | 'dockerPassword'>,
): DockerConfig | null {
  const url = s.dockerUrl?.trim()
  const password = s.dockerPassword
  if (!url || !password) return null
  return { url, lanUrl: s.dockerLanUrl?.trim() || undefined, user: s.dockerUser?.trim() || 'ludok', password }
}

export function dockerApi(config: DockerConfig): DockerApi {
  return new DockerApi(config, fetch as never)
}
