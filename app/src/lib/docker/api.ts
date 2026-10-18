// Cliente de la API de Docker de la Pi (a través del Caddy con contraseña de
// deploy/docker-api, publicado solo en Tailscale).
//
// El `fetch` se recibe por parámetro: en el móvil es el de `expo/fetch` (el
// normal de React Native no deja leer bytes, y logs y exec llegan en binario);
// en las pruebas, el de Node. Así `verify/docker-real.ts` ejecuta contra la Pi
// exactamente el mismo código que la app.
import {
  demux,
  HOST_STATS_SCRIPT,
  nameOf,
  NETWORK_SCRIPT,
  parseHostStats,
  parseNetworkScan,
  parseImageRef,
  parseNetstat,
  recreatePlan,
  SELF_NAME,
  stripAnsi,
  updateState,
  type HostStats,
  type ListeningPort,
  type NetworkScan,
  type UpdateState,
} from './core'
import type { ContainerInspect, ContainerSummary, DiskUsage, ImageInspect } from './types'

export interface DockerConfig {
  /** Por Tailscale: http://100.x.x.x:2375 */
  url: string
  /** Por la WiFi de casa, para cuando no hay Tailscale: http://192.168.1.x:2375 */
  lanUrl?: string
  user: string
  password: string
}

export type Route = 'tailscale' | 'casa'

interface ResponseLike {
  ok: boolean
  status: number
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}
type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<ResponseLike>

/** Base64 sin dependencias (la cabecera Basic). Mismo motivo que en nextcloud.ts. */
function base64(input: string): string {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  for (const ch of unescape(encodeURIComponent(input))) bytes.push(ch.charCodeAt(0))
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [b0, b1, b2] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : B64[b2 & 63]
  }
  return out
}

export class DockerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Mensajes que se entienden sin saber qué es la API de Docker. */
function describe(status: number, body: string, what: string): string {
  let msg = body
  try {
    msg = JSON.parse(body).message ?? body
  } catch {
    // no era JSON
  }
  if (status === 401) return 'Usuario o contraseña de Docker incorrectos.'
  if (status === 404) return `${what}: no existe (o ya no).`
  if (status === 409) return `${what}: ${msg || 'conflicto'}.`
  if (status === 304) return `${what}: ya estaba así.`
  return `${what}: ${msg || 'error ' + status}`
}

export interface UpdateCheck {
  name: string
  image: string
  state: UpdateState
}

export type Progress = (step: string) => void

export class DockerApi {
  private readonly routes: { route: Route; base: string }[]
  private readonly auth: string
  private chosen: { route: Route; base: string } | null = null

  constructor(
    config: DockerConfig,
    private readonly fetchImpl: FetchLike,
  ) {
    const clean = (u: string) => u.trim().replace(/\/+$/, '')
    this.routes = [{ route: 'tailscale' as Route, base: clean(config.url) }]
    if (config.lanUrl?.trim()) this.routes.push({ route: 'casa', base: clean(config.lanUrl) })
    this.auth = 'Basic ' + base64(`${config.user}:${config.password}`)
  }

  /** Por dónde se llegó a la Pi la última vez, o null si aún no se ha probado. */
  get via(): Route | null {
    return this.chosen?.route ?? null
  }

  /**
   * Elige la ruta: Tailscale primero y, si no responde en 2,5 s, la WiFi de
   * casa. Sin Tailscale, la IP 100.x no lleva a ninguna parte y la petición se
   * quedaba esperando el tiempo entero antes de rendirse; con un ping corto
   * delante, la de casa entra enseguida. Un 401 cuenta como «responde»: la
   * ruta es buena y lo que falla es la contraseña, que se dice después.
   */
  private async route(): Promise<string> {
    if (this.chosen) return this.chosen.base
    for (const r of this.routes) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2500)
      try {
        await this.fetchImpl(r.base + '/_ping', { headers: { Authorization: this.auth }, signal: controller.signal })
        this.chosen = r
        return r.base
      } catch {
        // esta no: la siguiente
      } finally {
        clearTimeout(timer)
      }
    }
    throw new DockerError(
      this.routes.length > 1
        ? 'No se llega a la Pi ni por Tailscale ni por la WiFi de casa.'
        : 'No se llega a la Pi. ¿Tienes Tailscale activado en el móvil?',
      0,
    )
  }

  private async request(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}, what = 'Docker'): Promise<ResponseLike> {
    const base = await this.route()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000)
    let res: ResponseLike
    try {
      res = await this.fetchImpl(base + path, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: this.auth,
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      })
    } catch {
      // Se ha cambiado de red (Tailscale apagado, fuera de casa): la próxima
      // petición vuelve a elegir ruta en vez de insistir en la que ya no va.
      this.chosen = null
      if (controller.signal.aborted) throw new DockerError(`${what}: la Pi tarda demasiado en responder.`, 0)
      throw new DockerError('Se ha perdido la conexión con la Pi.', 0)
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok && res.status !== 304) throw new DockerError(describe(res.status, await res.text(), what), res.status)
    return res
  }

  private async json<T>(path: string, what?: string): Promise<T> {
    return JSON.parse(await (await this.request(path, {}, what)).text()) as T
  }

  /* --- Lectura ----------------------------------------------------------- */

  version(): Promise<{ Version: string; ApiVersion: string; Os: string; Arch: string }> {
    return this.json('/version')
  }

  list(): Promise<ContainerSummary[]> {
    return this.json('/containers/json?all=1')
  }

  inspect(id: string): Promise<ContainerInspect> {
    return this.json(`/containers/${encodeURIComponent(id)}/json`, 'El contenedor')
  }

  async image(ref: string): Promise<ImageInspect | null> {
    try {
      return await this.json(`/images/${encodeURIComponent(ref)}/json`)
    } catch (e) {
      if (e instanceof DockerError && e.status === 404) return null
      throw e
    }
  }

  /** Digest publicado de una imagen. Lo pregunta el propio Docker al registro. */
  async remoteDigest(ref: string): Promise<string | null> {
    try {
      const d = await this.json<{ Descriptor: { digest: string } }>(`/distribution/${encodeURIComponent(ref)}/json`)
      return d.Descriptor?.digest ?? null
    } catch {
      return null
    }
  }

  async checkUpdate(container: ContainerInspect): Promise<UpdateCheck> {
    const ref = container.Config.Image ?? ''
    const [tagImage, remote] = await Promise.all([this.image(ref), this.remoteDigest(ref)])
    return { name: nameOf(container), image: ref, state: updateState(container, tagImage, remote) }
  }

  /** Últimas `tail` líneas de log, sin las cabeceras binarias ni colores ANSI. */
  async logs(id: string, tail = 200): Promise<string> {
    const res = await this.request(`/containers/${encodeURIComponent(id)}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}`, { timeoutMs: 30_000 }, 'Los logs')
    return stripAnsi(demux(new Uint8Array(await res.arrayBuffer())).all)
  }

  /**
   * Ejecuta un comando dentro del contenedor con `sh -c` y espera a que acabe.
   * Devuelve la salida y el código de salida. Para comandos cortos: nada que
   * se quede esperando entrada, que esto no es una terminal interactiva.
   */
  async exec(id: string, command: string, timeoutMs = 60_000): Promise<{ output: string; exitCode: number | null }> {
    const created = await this.request(
      `/containers/${encodeURIComponent(id)}/exec`,
      { method: 'POST', body: { AttachStdout: true, AttachStderr: true, Tty: false, Cmd: ['sh', '-c', command] } },
      'El comando',
    )
    const { Id } = JSON.parse(await created.text()) as { Id: string }
    const started = await this.request(`/exec/${Id}/start`, { method: 'POST', body: { Detach: false, Tty: false }, timeoutMs }, 'El comando')
    const output = stripAnsi(demux(new Uint8Array(await started.arrayBuffer())).all)
    const info = await this.json<{ ExitCode: number | null }>(`/exec/${Id}/json`)
    return { output, exitCode: info.ExitCode }
  }

  /**
   * Puertos ocupados en la Pi. El contenedor de la API va con la red del
   * sistema (ver deploy/docker-api), así que un netstat dentro de él ve todos
   * los de la Pi, no solo los de los contenedores.
   */
  async listeningPorts(): Promise<ListeningPort[]> {
    const { output } = await this.exec(SELF_NAME, 'netstat -tuln 2>/dev/null || ss -tuln')
    return parseNetstat(output)
  }

  /** Temperatura, RAM, disco, carga y tiempo encendida de la Pi (lo que era /pi). */
  async hostStats(): Promise<HostStats> {
    const { output } = await this.exec(SELF_NAME, HOST_STATS_SCRIPT, 20_000)
    return parseHostStats(output)
  }

  /** Dispositivos conectados a la red de casa (lo que era /red). Tarda unos segundos. */
  async networkScan(): Promise<NetworkScan> {
    const { output } = await this.exec(SELF_NAME, NETWORK_SCRIPT, 60_000)
    return parseNetworkScan(output)
  }

  /**
   * Cuánto ocupa cada cosa. Por partes y a la vez: entero, /system/df tardaba
   * 26 s en la Pi (los tamaños de los volúmenes se calculan recorriéndolos), y
   * por partes las imágenes y contenedores salen al instante y solo los
   * volúmenes se toman su tiempo.
   */
  async diskUsage(): Promise<DiskUsage> {
    const part = async (type: string) =>
      JSON.parse(await (await this.request(`/system/df?type=${type}`, { timeoutMs: 120_000 }, 'El uso de disco')).text()) as DiskUsage
    const [images, containers, volumes, build] = await Promise.all([
      part('image'),
      part('container'),
      part('volume'),
      part('build-cache').catch(() => ({}) as DiskUsage),
    ])
    return { Images: images.Images, Containers: containers.Containers, Volumes: volumes.Volumes, BuildCache: build.BuildCache }
  }

  /* --- Acciones ---------------------------------------------------------- */

  async start(id: string): Promise<void> {
    await this.request(`/containers/${encodeURIComponent(id)}/start`, { method: 'POST' }, 'Arrancar')
  }

  /** Para con el tiempo de gracia que pidió el contenedor (StopTimeout), o 10 s. */
  async stop(id: string, graceSeconds = 10): Promise<void> {
    await this.request(`/containers/${encodeURIComponent(id)}/stop?t=${graceSeconds}`, { method: 'POST', timeoutMs: (graceSeconds + 20) * 1000 }, 'Parar')
  }

  async restart(id: string, graceSeconds = 10): Promise<void> {
    await this.request(`/containers/${encodeURIComponent(id)}/restart?t=${graceSeconds}`, { method: 'POST', timeoutMs: (graceSeconds + 30) * 1000 }, 'Reiniciar')
  }

  /** Elimina el contenedor (parándolo si hace falta). Sus volúmenes con nombre se quedan. */
  async remove(id: string): Promise<void> {
    await this.request(`/containers/${encodeURIComponent(id)}?force=1`, { method: 'DELETE' }, 'Eliminar')
  }

  /**
   * Limpieza: contenedores parados, redes, volúmenes o caché.
   *
   * Las imágenes NO van por aquí: `docker image prune -a` se llevaría también
   * las actualizaciones descargadas sin aplicar. Se borran una a una con
   * `removeImage`, después de pasar por `classifyUnusedImages`.
   *
   * Los volúmenes, solo los ANÓNIMOS (lo que hace Docker por defecto). Con
   * `all` se irían también los que tienen nombre y no usa nadie en ese momento,
   * como la base de datos de un proyecto que está parado: datos perdidos.
   */
  async prune(kind: 'containers' | 'networks' | 'volumes' | 'build'): Promise<number> {
    const path = kind === 'build' ? '/build/prune' : `/${kind}/prune`
    // Hasta 10 minutos: en una tarjeta SD con gigas de imágenes viejas Docker
    // tarda, y si se corta la petición, Docker cancela la limpieza a medias.
    const res = await this.request(path, { method: 'POST', timeoutMs: 600_000 }, 'La limpieza')
    const body = JSON.parse(await res.text()) as { SpaceReclaimed?: number; CachesDeleted?: string[] }
    return body.SpaceReclaimed ?? 0
  }

  /**
   * Borra una imagen por su ID. Con force porque una imagen con dos etiquetas
   * no se deja borrar por ID sin él; solo se llama con imágenes que no usa
   * ningún contenedor (ver `classifyUnusedImages`).
   */
  async removeImage(id: string): Promise<void> {
    await this.request(`/images/${encodeURIComponent(id)}?force=1`, { method: 'DELETE', timeoutMs: 120_000 }, 'Borrar la imagen')
  }

  /** Descarga una imagen y espera a que acabe. Docker manda el progreso como JSON por líneas. */
  async pull(ref: string): Promise<void> {
    const { repo, tag } = parseImageRef(ref)
    const res = await this.request(
      `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`,
      { method: 'POST', timeoutMs: 900_000 },
      'Descargar la imagen',
    )
    // Un fallo de la descarga NO llega como código HTTP: llega como una línea
    // {"error": …} en mitad de un 200. Sin mirarlo, una descarga fallida
    // parecía buena y la actualización recreaba con la imagen vieja.
    for (const line of (await res.text()).split('\n')) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as { error?: string }
        if (msg.error) throw new DockerError(`Descargar la imagen: ${msg.error}`, 500)
      } catch (e) {
        if (e instanceof DockerError) throw e
      }
    }
  }

  /**
   * Actualiza un contenedor a `newRef` (por defecto, su misma etiqueta) sin
   * perder nada: descarga, para el viejo y lo renombra a «…_old», crea el nuevo
   * con la misma configuración, lo arranca, comprueba que AGUANTA unos segundos
   * en pie y solo entonces borra el viejo. Si algo falla, borra el nuevo y deja
   * el viejo como estaba.
   */
  async update(name: string, newRef?: string, progress: Progress = () => {}, verifySeconds = 15): Promise<void> {
    if (name === SELF_NAME) throw new DockerError('La puerta de la API no se puede actualizar desde la propia API: hazlo en la Pi.', 400)
    const old = await this.inspect(name)
    const ref = newRef ?? old.Config.Image ?? ''
    if (!ref || ref.startsWith('sha256:')) throw new DockerError('Este contenedor no dice de qué imagen viene: no se puede actualizar.', 400)

    progress('Descargando la imagen…')
    await this.pull(ref)
    const oldImage = await this.image(old.Image)
    const plan = recreatePlan(old, oldImage?.Config ?? null, ref)
    const wasRunning = old.State.Running
    const grace = typeof old.Config.StopTimeout === 'number' ? old.Config.StopTimeout : 10
    const backupName = `${plan.name}_old`

    // Un «_old» de un intento anterior que falló a medias impediría renombrar.
    if (await this.inspect(backupName).then(() => true, () => false)) {
      throw new DockerError(`Ya existe «${backupName}» de una actualización anterior. Elimínalo o renómbralo antes.`, 409)
    }

    let renamed = false
    let newId: string | null = null
    try {
      progress('Parando el contenedor…')
      if (wasRunning) await this.stop(old.Id, grace)
      await this.request(`/containers/${old.Id}/rename?name=${encodeURIComponent(backupName)}`, { method: 'POST' }, 'Renombrar')
      renamed = true

      progress('Creando el nuevo…')
      const created = await this.request(`/containers/create?name=${encodeURIComponent(plan.name)}`, { method: 'POST', body: plan.body }, 'Crear el contenedor')
      newId = (JSON.parse(await created.text()) as { Id: string }).Id
      for (const net of plan.extraNetworks) {
        await this.request(`/networks/${encodeURIComponent(net.name)}/connect`, { method: 'POST', body: { Container: newId, EndpointConfig: net.endpoint } }, 'Conectar la red')
      }

      if (wasRunning) {
        progress('Arrancando…')
        await this.start(newId)
        progress('Comprobando que aguanta en pie…')
        await this.verifyStaysUp(newId, verifySeconds)
      }

      progress('Borrando el viejo…')
      await this.remove(old.Id)
    } catch (e) {
      progress('Algo ha fallado: dejando el viejo como estaba…')
      if (newId) await this.remove(newId).catch(() => {})
      if (renamed) await this.request(`/containers/${old.Id}/rename?name=${encodeURIComponent(plan.name)}`, { method: 'POST' }).catch(() => {})
      if (wasRunning) await this.start(old.Id).catch(() => {})
      throw e
    }
  }

  /** Falla si en `seconds` el contenedor se para, se reinicia o se declara enfermo. */
  private async verifyStaysUp(id: string, seconds: number): Promise<void> {
    const first = await this.inspect(id)
    const deadline = Date.now() + seconds * 1000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000))
      const now = await this.inspect(id)
      if (!now.State.Running) throw new DockerError(`El nuevo se ha parado (código ${now.State.ExitCode}). Se deja el viejo.`, 500)
      if (now.RestartCount > first.RestartCount) throw new DockerError('El nuevo se está reiniciando en bucle. Se deja el viejo.', 500)
      if (now.State.Health?.Status === 'unhealthy') throw new DockerError('El nuevo dice que está enfermo (unhealthy). Se deja el viejo.', 500)
    }
  }
}
