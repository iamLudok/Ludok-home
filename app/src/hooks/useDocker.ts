import { useMemo } from 'react'
import { useSettingsQuery } from './useSettings'
import { dockerApi, dockerConfigFrom } from '../lib/docker/client'
import type { DockerApi } from '../lib/docker/api'

/** El cliente de Docker según los ajustes, o null si falta configurarlo. */
export function useDocker(): { api: DockerApi | null; ready: boolean } {
  const { data: settings, ready } = useSettingsQuery()
  const api = useMemo(() => {
    const config = dockerConfigFrom(settings)
    return config ? dockerApi(config) : null
  }, [settings.dockerUrl, settings.dockerLanUrl, settings.dockerUser, settings.dockerPassword])
  return { api, ready }
}
