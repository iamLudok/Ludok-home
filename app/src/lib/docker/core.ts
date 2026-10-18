// Reglas de la pantalla Servidor, sin red ni nada nativo: agrupar por proyecto,
// saber si un contenedor está bien, leer el flujo binario de logs y exec,
// decidir si hay actualización, preparar la recreación de un contenedor y
// sacar su docker-compose. Todo se prueba en `verify/docker.ts`.
import type { ContainerInspect, ContainerSummary, DiskImage, ImageInspect, ImageLikeConfig } from './types'

/** El contenedor que hace de puerta a la API. Parar o tocar este deja la app sin acceso. */
export const SELF_NAME = 'ludok-docker-api'

export function nameOf(c: { Names?: string[]; Name?: string }): string {
  const raw = c.Name ?? c.Names?.[0] ?? ''
  return raw.replace(/^\//, '')
}

export function projectOf(labels: Record<string, string> | null | undefined): string | null {
  return labels?.['com.docker.compose.project'] ?? null
}

/* --- Estado -------------------------------------------------------------- */

export type RunState = 'en-marcha' | 'parado' | 'reiniciando' | 'pausado' | 'creado' | 'muerto'
export type Health = 'sano' | 'mal' | 'arrancando' | null

export interface ContainerState {
  run: RunState
  health: Health
  /** «2 semanas», «3 horas»: cuánto lleva así, sacado del texto de Docker. */
  since: string
}

/** Unidad de Docker → [singular, plural] en castellano. */
const UNITS: Record<string, [string, string]> = {
  second: ['s', 's'],
  minute: ['min', 'min'],
  hour: ['h', 'h'],
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años'],
}

/** «2 weeks» → «2 semanas», «About an hour» → «1 h». Lo que no entiende lo deja tal cual. */
export function spanishDuration(en: string): string {
  const s = en.trim()
  if (/^less than a second$/i.test(s)) return 'un momento'
  const m = /^(\d+|an?|about an?)\s+(second|minute|hour|day|week|month|year)s?$/i.exec(s)
  if (!m) return s
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1
  const [one, many] = UNITS[m[2].toLowerCase()]
  return `${n} ${n === 1 ? one : many}`
}

export function stateOf(c: Pick<ContainerSummary, 'State' | 'Status'>): ContainerState {
  const status = c.Status ?? ''
  const health: Health = /\(healthy\)/i.test(status)
    ? 'sano'
    : /\(unhealthy\)/i.test(status)
      ? 'mal'
      : /\(health: starting\)/i.test(status)
        ? 'arrancando'
        : null
  const run: RunState =
    c.State === 'running'
      ? 'en-marcha'
      : c.State === 'restarting'
        ? 'reiniciando'
        : c.State === 'paused'
          ? 'pausado'
          : c.State === 'created'
            ? 'creado'
            : c.State === 'dead'
              ? 'muerto'
              : 'parado'
  const m = /^(?:Up|Exited \(\d+\)|Restarting \(\d+\))\s+(.+?)(?:\s+ago)?(?:\s+\(.*\))?$/i.exec(status)
  return { run, health, since: m ? spanishDuration(m[1]) : '' }
}

/** Milisegundos → «2 semanas», «3 h», «un momento». */
export function humanSpan(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 2) return 'un momento'
  const steps: [number, string, string][] = [
    [31_536_000, 'año', 'años'],
    [2_592_000, 'mes', 'meses'],
    [604_800, 'semana', 'semanas'],
    [86_400, 'día', 'días'],
    [3_600, 'h', 'h'],
    [60, 'min', 'min'],
  ]
  for (const [size, one, many] of steps) {
    const n = Math.floor(s / size)
    if (n >= 1) return `${n} ${n === 1 ? one : many}`
  }
  return `${s} s`
}

/**
 * El mismo estado que `stateOf`, pero desde un inspect (la ficha de un
 * contenedor), donde no viene el texto «Up 2 weeks» sino las fechas.
 */
export function stateFromInspect(c: Pick<ContainerInspect, 'State'>, now = Date.now()): ContainerState {
  const h = c.State.Health?.Status
  const health: Health = h === 'healthy' ? 'sano' : h === 'unhealthy' ? 'mal' : h === 'starting' ? 'arrancando' : null
  const run = stateOf({ State: c.State.Status, Status: '' }).run
  const from = Date.parse(c.State.Running ? c.State.StartedAt : c.State.FinishedAt)
  return { run, health, since: Number.isFinite(from) && from > 0 ? humanSpan(now - from) : '' }
}

/** Si un contenedor necesita que lo mires: parado sin querer, reiniciándose o con mala salud. */
export function needsAttention(s: ContainerState): boolean {
  return s.run === 'reiniciando' || s.run === 'muerto' || s.health === 'mal'
}

export interface HostPort {
  host: number
  container: number
  proto: string
}

/** Puertos publicados, sin el duplicado IPv4/IPv6 que da Docker para cada uno. */
export function hostPorts(c: Pick<ContainerSummary, 'Ports'>): HostPort[] {
  const seen = new Set<string>()
  const out: HostPort[] = []
  for (const p of c.Ports ?? []) {
    if (!p.PublicPort) continue
    const key = `${p.PublicPort}/${p.Type}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ host: p.PublicPort, container: p.PrivatePort, proto: p.Type })
  }
  return out.sort((a, b) => a.host - b.host)
}

export interface ProjectGroup {
  /** null = contenedores sueltos, sin compose. */
  project: string | null
  containers: ContainerSummary[]
}

/** Agrupa por proyecto de compose, por orden alfabético; los sueltos al final. */
export function groupByProject(list: ContainerSummary[]): ProjectGroup[] {
  const groups = new Map<string | null, ContainerSummary[]>()
  for (const c of list) {
    const p = projectOf(c.Labels)
    groups.set(p, [...(groups.get(p) ?? []), c])
  }
  return [...groups.entries()]
    .map(([project, containers]) => ({
      project,
      containers: containers.sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    }))
    .sort((a, b) => (a.project === null ? 1 : b.project === null ? -1 : a.project.localeCompare(b.project)))
}

/* --- Flujo binario de logs y exec --------------------------------------- */

/**
 * UTF-8 a texto a mano. TextDecoder no está garantizado en el motor de React
 * Native, y los logs llevan acentos y emojis que no pueden salir rotos.
 */
export function utf8(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    let cp: number
    let n = 0
    if (b < 0x80) cp = b
    else if (b >= 0xc0 && b < 0xe0) (cp = b & 0x1f), (n = 1)
    else if (b >= 0xe0 && b < 0xf0) (cp = b & 0x0f), (n = 2)
    else if (b >= 0xf0 && b < 0xf8) (cp = b & 0x07), (n = 3)
    else {
      out += '�'
      i++
      continue
    }
    // Carácter cortado al final (un log truncado justo en medio de una «ñ»).
    if (i + n >= bytes.length) {
      out += '�'
      break
    }
    for (let k = 1; k <= n; k++) cp = (cp << 6) | (bytes[i + k] & 0x3f)
    out += String.fromCodePoint(cp)
    i += n + 1
  }
  return out
}

export interface Demuxed {
  stdout: string
  stderr: string
  /** Las dos salidas intercaladas en el orden en que llegaron. */
  all: string
}

/**
 * Separa el flujo «multiplexado» de Docker: cuando el contenedor no tiene TTY,
 * cada trozo va precedido de 8 bytes (1: stdout, 2: stderr; luego tres ceros y
 * el tamaño en 4 bytes big-endian). Sin quitar esas cabeceras, los logs salían
 * con basura al principio de cada línea. Con TTY no hay cabeceras: se devuelve
 * el texto tal cual.
 */
export function demux(bytes: Uint8Array): Demuxed {
  const framed = bytes.length >= 8 && bytes[0] <= 2 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0
  if (!framed) {
    const text = utf8(bytes)
    return { stdout: text, stderr: '', all: text }
  }
  const out: Uint8Array[] = []
  const err: Uint8Array[] = []
  const all: Uint8Array[] = []
  let i = 0
  while (i + 8 <= bytes.length) {
    const stream = bytes[i]
    const size = ((bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7]) >>> 0
    const chunk = bytes.subarray(i + 8, Math.min(bytes.length, i + 8 + size))
    if (stream === 2) err.push(chunk)
    else out.push(chunk)
    all.push(chunk)
    i += 8 + size
  }
  const join = (parts: Uint8Array[]) => {
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let offset = 0
    for (const p of parts) {
      buf.set(p, offset)
      offset += p.length
    }
    return utf8(buf)
  }
  return { stdout: join(out), stderr: join(err), all: join(all) }
}

/** Quita los códigos de color ANSI que muchas imágenes meten en sus logs. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

/* --- Imágenes y actualizaciones ----------------------------------------- */

export interface ImageRef {
  /** Sin etiqueta ni digest: «vaultwarden/server», «ghcr.io/immich-app/immich-server». */
  repo: string
  tag: string
  /** Si está fijada a un digest concreto (…@sha256:…). */
  digest?: string
}

/**
 * Separa repositorio, etiqueta y digest. La etiqueta es lo que va tras el
 * último «:» DESPUÉS de la última «/»: el primer «:» puede ser el puerto de un
 * registro privado (localhost:5000/app), y cortar por ahí daba repos rotos.
 */
export function parseImageRef(ref: string): ImageRef {
  const [withoutDigest, digest] = ref.split('@')
  const colon = withoutDigest.lastIndexOf(':')
  const slash = withoutDigest.lastIndexOf('/')
  const hasTag = colon > slash
  return {
    repo: hasTag ? withoutDigest.slice(0, colon) : withoutDigest,
    tag: hasTag ? withoutDigest.slice(colon + 1) : 'latest',
    digest: digest || undefined,
  }
}

export function refWithTag(ref: string, tag: string): string {
  return `${parseImageRef(ref).repo}:${tag}`
}

export type UpdateState =
  /** Al día con lo que hay publicado. */
  | 'al-dia'
  /** Hay una versión nueva publicada. */
  | 'disponible'
  /** La nueva ya está descargada en la Pi, pero el contenedor sigue con la vieja. */
  | 'descargada'
  /** Fijada a un digest concreto (…@sha256): no se actualiza a propósito. */
  | 'fijada'
  /** No se pudo saber (registro privado, sin red, imagen local). */
  | 'desconocida'

/**
 * Si un contenedor tiene actualización. Dos casos distintos que importan:
 * que haya algo nuevo publicado, y que ya se descargara pero no se aplicara
 * (la etiqueta apunta a otra imagen que la del contenedor). Este segundo es el
 * que se escapaba: Docker enseña entonces el contenedor con un ID en vez del
 * nombre de su imagen, y sin mirarlo parecía al día.
 *
 * `remoteDigest` sale de GET /distribution/{imagen}/json, que pregunta el
 * propio Docker al registro: así la app no maneja tokens de Docker Hub ni ghcr.
 */
export function updateState(
  container: Pick<ContainerInspect, 'Config' | 'Image'>,
  tagImage: Pick<ImageInspect, 'Id' | 'RepoDigests'> | null,
  remoteDigest: string | null,
): UpdateState {
  const ref = container.Config.Image ?? ''
  if (parseImageRef(ref).digest) return 'fijada'
  if (tagImage && tagImage.Id !== container.Image) return 'descargada'
  if (!remoteDigest || !tagImage) return 'desconocida'
  const localDigests = (tagImage.RepoDigests ?? []).map((d) => d.split('@')[1])
  return localDigests.includes(remoteDigest) ? 'al-dia' : 'disponible'
}

/** La versión que declara la imagen, por su etiqueta OCI o su variable *_VERSION. */
export function imageVersion(config: ImageLikeConfig | null | undefined): string | undefined {
  const labels = config?.Labels ?? {}
  const label = labels['org.opencontainers.image.version'] ?? labels['org.label-schema.version']
  if (label) return label
  for (const e of config?.Env ?? []) {
    const m = /^([A-Z0-9_]*VERSION)=(.+)$/.exec(e)
    if (m && !/^(PYTHON|NODE|GPG|PIP|GOLANG|JAVA)_/.test(m[1])) return m[2]
  }
  return undefined
}

/* --- Recrear un contenedor (para actualizar) ---------------------------- */

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** null, [] y '' significan lo mismo en ENTRYPOINT/CMD: «nada». */
const command = (v: unknown) => (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ? [] : v)

export interface RecreatePlan {
  name: string
  /** Cuerpo para POST /containers/create?name=… */
  body: Record<string, unknown>
  /** Redes que se conectan después de crearlo: /containers/create solo admite una. */
  extraNetworks: { name: string; endpoint: Record<string, unknown> }[]
}

/**
 * Prepara la recreación de un contenedor con otra imagen, conservando toda su
 * configuración. Lo delicado: Docker mezcla la Config de la imagen dentro de la
 * del contenedor al crearlo, así que el inspect no distingue lo que pusiste tú
 * de lo que venía en la imagen. Todo lo que coincide con la imagen VIEJA se
 * quita, para que la nueva ponga lo suyo (la misma idea que Watchtower): si se
 * copiara tal cual, una versión que cambia su ENTRYPOINT o su HEALTHCHECK
 * arrancaría con los de la vieja y se quedaría reiniciándose en bucle.
 */
export function recreatePlan(
  container: ContainerInspect,
  oldImageConfig: ImageLikeConfig | null,
  newImageRef: string,
): RecreatePlan {
  const cfg: Record<string, unknown> = { ...container.Config, Image: newImageRef }
  const img = oldImageConfig ?? {}

  if (oldImageConfig) {
    // ENTRYPOINT/CMD: CMD solo se hereda si ENTRYPOINT también, porque un
    // ENTRYPOINT propio cambia lo que significa CMD.
    if (same(command(cfg.Entrypoint), command(img.Entrypoint))) {
      delete cfg.Entrypoint
      if (same(command(cfg.Cmd), command(img.Cmd))) delete cfg.Cmd
    }
    for (const key of ['WorkingDir', 'User', 'Healthcheck', 'StopSignal'] as const) {
      if (same(cfg[key], img[key])) delete cfg[key]
    }
    // Variables, etiquetas, puertos y volúmenes: se quitan una a una las que
    // vienen de la imagen y se conservan las tuyas.
    const imageEnv = new Set(img.Env ?? [])
    cfg.Env = ((cfg.Env as string[] | undefined) ?? []).filter((e) => !imageEnv.has(e))
    const labels = { ...((cfg.Labels as Record<string, string> | undefined) ?? {}) }
    for (const [k, v] of Object.entries(img.Labels ?? {})) if (labels[k] === v) delete labels[k]
    cfg.Labels = labels
    for (const key of ['ExposedPorts', 'Volumes'] as const) {
      const mine = { ...((cfg[key] as Record<string, object> | undefined) ?? {}) }
      for (const k of Object.keys(img[key] ?? {})) delete mine[k]
      cfg[key] = Object.keys(mine).length ? mine : undefined
    }
  }

  // El hostname automático es el ID corto del contenedor viejo: copiarlo
  // haría que el nuevo se llamara como el que ya no existe.
  if (typeof cfg.Hostname === 'string' && container.Id.startsWith(cfg.Hostname)) delete cfg.Hostname

  const networkMode = container.HostConfig.NetworkMode ?? 'default'
  const networks = Object.entries(container.NetworkSettings.Networks ?? {})
  const endpointOf = (ep: Record<string, unknown>) => {
    const aliases = ((ep.Aliases as string[] | null) ?? []).filter((a) => !container.Id.startsWith(a))
    const out: Record<string, unknown> = {}
    if (ep.IPAMConfig) out.IPAMConfig = ep.IPAMConfig
    if (aliases.length) out.Aliases = aliases
    if (ep.MacAddress && ep.IPAMConfig) out.MacAddress = ep.MacAddress
    return out
  }
  // host, none y container:… no llevan endpoints: la red es la de otro.
  const usesEndpoints = !/^(host|none|container:)/.test(networkMode)
  const [first, ...rest] = usesEndpoints ? networks : []
  // Volúmenes anónimos (los que crea la imagen con VOLUME sin que les pongas
  // nombre): no salen en Binds ni en Mounts del HostConfig, solo en Mounts del
  // contenedor. Si no se vuelven a montar a mano, el nuevo estrena uno vacío y
  // parece que los datos se han perdido (siguen ahí, pero huérfanos).
  const hostConfig: Record<string, unknown> = { ...container.HostConfig }
  const binds = [...((hostConfig.Binds as string[] | null | undefined) ?? [])]
  const covered = new Set<string>([
    ...binds.map((b) => b.split(':')[1]).filter(Boolean),
    ...(((hostConfig.Mounts as { Target?: string }[] | null | undefined) ?? []).map((m) => m.Target ?? '')),
  ])
  for (const m of container.Mounts) {
    if (m.Type !== 'volume' || !m.Name || covered.has(m.Destination)) continue
    binds.push(`${m.Name}:${m.Destination}${m.RW ? '' : ':ro'}`)
  }
  if (binds.length) hostConfig.Binds = binds

  const body: Record<string, unknown> = {
    ...cfg,
    HostConfig: hostConfig,
  }
  if (first) body.NetworkingConfig = { EndpointsConfig: { [first[0]]: endpointOf(first[1]) } }

  return {
    name: nameOf(container),
    body,
    extraNetworks: rest.map(([name, ep]) => ({ name, endpoint: endpointOf(ep) })),
  }
}

/* --- docker-compose a partir de un contenedor ---------------------------- */

/**
 * Un valor YAML, entre comillas solo si hace falta: «vaultwarden/server:1.2»
 * va tal cual, pero «DOMAIN=https://x» o «a: b» las necesitan, y también lo
 * que YAML leería como booleano o número.
 */
function y(v: string): string {
  const plain = /^[\w./@=+-]+(:[\w.@=+-]+)*$/.test(v) && !/^(true|false|yes|no|null|on|off|~|[\d.]+)$/i.test(v)
  return plain ? v : JSON.stringify(v)
}

/**
 * Siempre entre comillas: puertos y volúmenes. «8081:80» sin comillas YAML 1.1
 * lo lee como un número en base 60, que es un clásico de los compose rotos.
 */
const q = (v: string) => JSON.stringify(v)

/**
 * Un docker-compose.yml equivalente al contenedor, para guardarlo o rehacerlo
 * en otro sitio. Solo lo que cambia respecto a la imagen: lo heredado de ella
 * se queda fuera, igual que al recrear (ver `recreatePlan`).
 *
 * Lleva las variables de entorno TAL CUAL, contraseñas incluidas: la pantalla
 * lo avisa antes de compartirlo.
 */
export function composeYaml(container: ContainerInspect, imageConfig: ImageLikeConfig | null): string {
  const name = nameOf(container)
  const service = container.Config.Labels?.['com.docker.compose.service'] ?? name
  const plan = recreatePlan(container, imageConfig, container.Config.Image ?? '')
  const cfg = plan.body
  const hc = container.HostConfig
  const L: string[] = ['services:', `  ${y(service)}:`, `    image: ${y(String(container.Config.Image ?? ''))}`, `    container_name: ${y(name)}`]

  const restart = hc.RestartPolicy?.Name
  if (restart && restart !== 'no') L.push(`    restart: ${restart}`)

  const mode = hc.NetworkMode ?? 'default'
  if (/^(host|none)$/.test(mode) || mode.startsWith('container:')) L.push(`    network_mode: ${y(mode)}`)

  const ports: string[] = []
  for (const [key, binds] of Object.entries(hc.PortBindings ?? {})) {
    const [cport, proto] = key.split('/')
    for (const b of binds ?? []) {
      const ip = b.HostIp && b.HostIp !== '0.0.0.0' && b.HostIp !== '::' ? `${b.HostIp}:` : ''
      ports.push(`${ip}${b.HostPort ?? cport}:${cport}${proto && proto !== 'tcp' ? '/' + proto : ''}`)
    }
  }
  const uniquePorts = [...new Set(ports)]
  if (uniquePorts.length) L.push('    ports:', ...uniquePorts.map((p) => `      - ${q(p)}`))

  const vols = container.Mounts.map((m) => {
    const src = m.Type === 'volume' ? m.Name ?? m.Source : m.Source
    return `${src}:${m.Destination}${m.RW ? '' : ':ro'}`
  })
  if (vols.length) L.push('    volumes:', ...vols.map((v) => `      - ${q(v)}`))

  const env = (cfg.Env as string[] | undefined) ?? []
  if (env.length) L.push('    environment:', ...env.map((e) => `      - ${y(e)}`))

  const userLabels = Object.entries((cfg.Labels as Record<string, string> | undefined) ?? {}).filter(([k]) => !k.startsWith('com.docker.compose.'))
  if (userLabels.length) L.push('    labels:', ...userLabels.map(([k, v]) => `      ${y(k)}: ${y(v)}`))

  if (Array.isArray(cfg.Entrypoint)) L.push(`    entrypoint: ${JSON.stringify(cfg.Entrypoint)}`)
  if (Array.isArray(cfg.Cmd)) L.push(`    command: ${JSON.stringify(cfg.Cmd)}`)
  if (cfg.User) L.push(`    user: ${y(String(cfg.User))}`)
  if (cfg.WorkingDir) L.push(`    working_dir: ${y(String(cfg.WorkingDir))}`)
  if (hc.Privileged) L.push('    privileged: true')
  if (hc.CapAdd?.length) L.push('    cap_add:', ...hc.CapAdd.map((c) => `      - ${c}`))
  if (hc.Devices?.length) L.push('    devices:', ...hc.Devices.map((d) => `      - ${y(`${d.PathOnHost}:${d.PathInContainer}`)}`))
  if (hc.ExtraHosts?.length) L.push('    extra_hosts:', ...hc.ExtraHosts.map((h) => `      - ${y(h)}`))

  // La red «<proyecto>_default» la crea el propio compose: ni se nombra ni es externa.
  const project = container.Config.Labels?.['com.docker.compose.project']
  const nets = Object.keys(container.NetworkSettings.Networks ?? {}).filter(
    (n) => n !== 'bridge' && n !== `${project}_default` && !/^(host|none)$/.test(mode),
  )
  if (nets.length) {
    L.push('    networks:', ...nets.map((n) => `      - ${y(n)}`), 'networks:', ...nets.map((n) => `  ${y(n)}:\n    external: true`))
  }
  return L.join('\n') + '\n'
}

/* --- Puertos de la Pi ---------------------------------------------------- */

export interface ListeningPort {
  proto: 'tcp' | 'udp'
  address: string
  port: number
}

/** Puertos en escucha a partir de la salida de `netstat -tuln` (o `ss -tuln`). */
export function parseNetstat(out: string): ListeningPort[] {
  const seen = new Set<string>()
  const list: ListeningPort[] = []
  for (const line of out.split('\n')) {
    const cols = line.trim().split(/\s+/)
    const proto = cols[0]?.startsWith('udp') ? 'udp' : cols[0]?.startsWith('tcp') ? 'tcp' : null
    if (!proto) continue
    // netstat: proto recv send local … ; ss: proto estado recv send local …
    const local = cols.find((c, i) => i >= 3 && /:\d+$/.test(c))
    if (!local) continue
    const idx = local.lastIndexOf(':')
    const port = Number(local.slice(idx + 1))
    const address = local.slice(0, idx).replace(/^\[|\]$/g, '')
    const key = `${proto}/${port}/${address}`
    if (!port || seen.has(key)) continue
    seen.add(key)
    list.push({ proto, address, port })
  }
  return list.sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto))
}

/** Libre si nadie escucha en ese puerto con ese protocolo en ninguna dirección. */
export function isPortFree(port: number, used: ListeningPort[], proto: 'tcp' | 'udp' = 'tcp'): boolean {
  return !used.some((u) => u.port === port && u.proto === proto)
}

/** Un puerto libre al azar entre min y max (tcp y udp). null si no encuentra. */
export function randomFreePort(used: ListeningPort[], rng: () => number = Math.random, min = 10000, max = 60000): number | null {
  const taken = new Set(used.map((u) => u.port))
  for (let i = 0; i < 200; i++) {
    const p = min + Math.floor(rng() * (max - min + 1))
    if (!taken.has(p)) return p
  }
  return null
}

/* --- Lo que ha cambiado desde la última vez ------------------------------ */

export interface SnapshotEntry {
  running: boolean
  startedAt: string
  restartCount: number
  imageId: string
}

export type Snapshot = Record<string, SnapshotEntry>

export interface ChangeEvent {
  name: string
  kind: 'parado' | 'arrancado' | 'reiniciado' | 'nuevo' | 'eliminado' | 'imagen'
}

export function snapshotOf(inspects: ContainerInspect[]): Snapshot {
  const out: Snapshot = {}
  for (const c of inspects) {
    out[nameOf(c)] = {
      running: c.State.Running,
      startedAt: c.State.StartedAt,
      restartCount: c.RestartCount,
      imageId: c.Image,
    }
  }
  return out
}

/**
 * Qué pasó entre dos visitas a la pantalla. Es el sustituto de los avisos del
 * bot: no llegan solos, pero al abrir «Servidor» ves que Immich se reinició
 * anoche o que algo se paró.
 */
export function diffSnapshots(before: Snapshot | null, now: Snapshot): ChangeEvent[] {
  if (!before) return []
  const events: ChangeEvent[] = []
  for (const [name, n] of Object.entries(now)) {
    const b = before[name]
    if (!b) {
      events.push({ name, kind: 'nuevo' })
      continue
    }
    if (b.imageId !== n.imageId) events.push({ name, kind: 'imagen' })
    if (b.running && !n.running) events.push({ name, kind: 'parado' })
    else if (!b.running && n.running) events.push({ name, kind: 'arrancado' })
    else if (n.running && (n.restartCount > b.restartCount || (b.startedAt !== n.startedAt && b.imageId === n.imageId))) {
      events.push({ name, kind: 'reiniciado' })
    }
  }
  for (const name of Object.keys(before)) if (!now[name]) events.push({ name, kind: 'eliminado' })
  return events
}

/* --- Avisos antes de tocar algo ------------------------------------------ */

/** Por qué pensárselo dos veces antes de parar, eliminar o actualizar este contenedor. */
export function riskOf(name: string): string | null {
  if (name === SELF_NAME) return 'Es la puerta por la que la app habla con Docker: si lo paras, esta pantalla deja de funcionar hasta que lo arranques desde la Pi.'
  if (/nextcloud/i.test(name)) return 'Ludok Home depende de Nextcloud para las tareas, las noticias y las copias.'
  if (/vaultwarden|bitwarden/i.test(name)) return 'Tus contraseñas no estarán disponibles mientras esté parado.'
  if (/pihole|adguard/i.test(name)) return 'Si hace de DNS de casa, los dispositivos se quedarán sin internet mientras esté parado.'
  if (/(postgres|mariadb|mysql|redis|valkey|db)/i.test(name)) return 'Es una base de datos: lo que dependa de ella dejará de funcionar.'
  return null
}

/* --- Qué imágenes se pueden borrar ---------------------------------------- */

/**
 * La misma imagen se escribe de varias formas: «valkey/valkey:8»,
 * «docker.io/valkey/valkey:8», «vaultwarden/server» (sin «:latest») o
 * «docker.io/library/nginx». Sin igualarlas, una imagen en uso parecía de una
 * app que ya no tienes.
 */
export function normalizeRef(ref: string): string {
  const { repo, tag } = parseImageRef(ref.split('@')[0])
  const clean = repo.replace(/^docker\.io\//, '').replace(/^library\//, '')
  return `${clean}:${tag}`
}

const repoOfRef = (ref: string) => normalizeRef(ref).replace(/:[^:/]+$/, '')

export type ImageGroup =
  /** Versión vieja de algo que sí usas: la dejó una actualización. */
  | 'vieja'
  /** De una app que ya no tienes en marcha. */
  | 'sin-uso'
  /** La versión nueva de algo que usas, descargada pero sin aplicar: mejor no borrarla. */
  | 'pendiente'

export interface CleanupImage {
  id: string
  label: string
  group: ImageGroup
  /** Lo que se libera de verdad (sin las capas que comparte con otras). */
  reclaim: number
  created?: number
}

/**
 * Reparte las imágenes que no usa ningún contenedor en los tres grupos. Hace lo
 * que no hace `docker image prune -a`: no tocar las actualizaciones descargadas
 * y sin aplicar, que borrarlas solo obliga a descargarlas otra vez.
 */
export function classifyUnusedImages(images: DiskImage[], containerImages: string[]): CleanupImage[] {
  const used = new Set(containerImages.filter((r) => r && !r.startsWith('sha256:')).map(normalizeRef))
  const usedRepos = new Set([...used].map((r) => r.replace(/:[^:/]+$/, '')))
  const out: CleanupImage[] = []
  for (const img of images) {
    if (img.Containers !== 0) continue
    const tags = (img.RepoTags ?? []).filter((t) => t !== '<none>:<none>')
    const digestRepo = (img.RepoDigests ?? [])[0]?.split('@')[0]
    const repo = tags.length ? repoOfRef(tags[0]) : digestRepo ? repoOfRef(digestRepo) : null
    const group: ImageGroup = tags.some((t) => used.has(normalizeRef(t)))
      ? 'pendiente'
      : repo && usedRepos.has(repo)
        ? 'vieja'
        : 'sin-uso'
    out.push({
      id: img.Id,
      label: tags[0] ?? (repo ? `${repo} (versión anterior)` : img.Id.slice(7, 19)),
      group,
      reclaim: Math.max(0, img.Size - (img.SharedSize ?? 0)),
      created: img.Created,
    })
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label) || (b.created ?? 0) - (a.created ?? 0))
}

/* --- Estado de la Pi y dispositivos de la red (lo que eran /pi y /red) ---- */

/**
 * Lo que se ejecuta dentro del contenedor de la API para saber cómo está la
 * Pi. Ese contenedor va con la red del sistema y ve /proc y /sys de la Pi, así
 * que no hace falta ningún programa ni servicio más: solo se lee al pedirlo.
 */
export const HOST_STATS_SCRIPT = [
  'echo "temp=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)"',
  "awk '/^MemTotal/{print \"memTotal=\"$2} /^MemAvailable/{print \"memAvail=\"$2}' /proc/meminfo",
  "df -k / | awk 'NR==2{print \"diskTotal=\"$2; print \"diskUsed=\"$3}'",
  "awk '{print \"uptime=\"$1}' /proc/uptime",
  "awk '{print \"load=\"$1\" \"$2\" \"$3}' /proc/loadavg",
  'echo "cpus=$(nproc)"',
].join('; ')

export interface HostStats {
  /** °C, o null si la Pi no lo da. */
  tempC: number | null
  memTotalKb: number
  memAvailKb: number
  diskTotalKb: number
  diskUsedKb: number
  uptimeSec: number
  load: [number, number, number]
  cpus: number
}

function kv(out: string): Record<string, string> {
  const m: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) m[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return m
}

export function parseHostStats(out: string): HostStats {
  const m = kv(out)
  const num = (k: string) => Number(m[k] ?? 0) || 0
  const t = Number(m.temp)
  const load = (m.load ?? '').split(/\s+/).map(Number)
  return {
    // El kernel da milésimas de grado: 46850 son 46,85 °C.
    tempC: m.temp && Number.isFinite(t) ? Math.round(t / 100) / 10 : null,
    memTotalKb: num('memTotal'),
    memAvailKb: num('memAvail'),
    diskTotalKb: num('diskTotal'),
    diskUsedKb: num('diskUsed'),
    uptimeSec: Math.floor(num('uptime')),
    load: [load[0] || 0, load[1] || 0, load[2] || 0],
    cpus: num('cpus') || 1,
  }
}

/** Los mismos umbrales que tenía el bot de Telegram. */
export const LIMITS = { tempWarn: 70, tempCritical: 80, ramWarn: 85, diskWarn: 90 }

export interface HostReading {
  label: string
  value: string
  /** 0-100 para la barra, si tiene sentido. */
  percent?: number
  level: 'bien' | 'aviso' | 'mal'
}

/** Las lecturas listas para enseñar, con su nivel según los umbrales. */
export function hostReadings(s: HostStats): HostReading[] {
  const pct = (used: number, total: number) => (total > 0 ? Math.round((100 * used) / total) : 0)
  const ram = pct(s.memTotalKb - s.memAvailKb, s.memTotalKb)
  const disk = pct(s.diskUsedKb, s.diskTotalKb)
  const gb = (kb: number) => (kb / 1048576).toFixed(1).replace('.', ',')
  const out: HostReading[] = []
  if (s.tempC !== null) {
    out.push({
      label: 'Temperatura',
      value: `${String(s.tempC).replace('.', ',')} °C`,
      level: s.tempC >= LIMITS.tempCritical ? 'mal' : s.tempC >= LIMITS.tempWarn ? 'aviso' : 'bien',
    })
  }
  out.push({ label: 'RAM', value: `${gb(s.memTotalKb - s.memAvailKb)} de ${gb(s.memTotalKb)} GB`, percent: ram, level: ram >= LIMITS.ramWarn ? 'aviso' : 'bien' })
  out.push({ label: 'Disco', value: `${gb(s.diskUsedKb)} de ${gb(s.diskTotalKb)} GB`, percent: disk, level: disk >= LIMITS.diskWarn ? 'aviso' : 'bien' })
  // Carga media de 5 minutos por núcleo: por encima de 1 hay cola esperando.
  const perCore = s.load[1] / s.cpus
  out.push({
    label: 'Carga',
    value: `${s.load.map((l) => l.toFixed(2).replace('.', ',')).join(' · ')}`,
    level: perCore >= 1.5 ? 'mal' : perCore >= 1 ? 'aviso' : 'bien',
  })
  out.push({ label: 'Encendida', value: humanSpan(s.uptimeSec * 1000), level: 'bien' })
  return out
}

/**
 * Busca los dispositivos de la red de casa: un ping a cada IP del /24 de la Pi
 * (todos a la vez, un segundo de espera) para que se apunten en la tabla de
 * vecinos, y luego se lee esa tabla. Sin nmap: el contenedor no lo tiene y el
 * ping de busybox basta para saber quién está conectado.
 */
export const NETWORK_SCRIPT = [
  "dev=$(ip route | awk '/^default/{print $5; exit}')",
  "cidr=$(ip -4 -o addr show dev \"$dev\" | awk '{print $4; exit}')",
  'echo "dev=$dev"',
  'echo "self=$cidr"',
  "echo \"gw=$(ip route | awk '/^default/{print $3; exit}')\"",
  'p=${cidr%.*}',
  'for i in $(seq 1 254); do ping -c1 -W1 "$p.$i" >/dev/null 2>&1 & done; wait',
  'cat /proc/net/arp',
  // Fabricante por los 6 primeros caracteres de la MAC, con la base de nmap
  // que se monta en el contenedor (ver deploy/docker-api). Una línea por MAC:
  // «vendor <mac> <fabricante>». Si la base no está, simplemente no sale nada.
  "awk 'NR>1 && $3==\"0x2\"{print $4}' /proc/net/arp | sort -u | while read m; do " +
    'p6=$(echo "$m" | tr -d : | cut -c1-6 | tr a-f A-F); ' +
    'v=$(grep -m1 "^$p6 " /oui.txt 2>/dev/null | cut -d" " -f2-); ' +
    '[ -n "$v" ] && echo "vendor $m $v"; done',
].join('; ')

export interface NetDevice {
  ip: string
  mac: string
  /** Fabricante de la tarjeta de red, si se conoce («zte», «Sagemcom Broadband SAS»). */
  vendor?: string
}

export interface NetworkScan {
  /** IP de la Pi en la red de casa. */
  self: string | null
  gateway: string | null
  devices: NetDevice[]
}

const lastOctet = (ip: string) => Number(ip.split('.').pop()) || 0

export function parseNetworkScan(out: string): NetworkScan {
  const m = kv(out)
  const dev = m.dev
  const devices: NetDevice[] = []
  const seen = new Set<string>()
  const vendors = new Map<string, string>()
  for (const line of out.split('\n')) {
    const v = /^vendor\s+(\S+)\s+(.+)$/.exec(line.trim())
    if (v) vendors.set(v[1].toLowerCase(), v[2].trim())
  }
  for (const line of out.split('\n')) {
    // IP  HWtype  Flags  MAC  Mask  Device
    const cols = line.trim().split(/\s+/)
    if (cols.length < 6 || !/^\d+\.\d+\.\d+\.\d+$/.test(cols[0])) continue
    const [ip, , flags, mac, , iface] = cols
    // 0x2 = respondió de verdad; 0x0 son las IPs a las que se hizo ping y nadie contestó.
    if (flags !== '0x2' || mac === '00:00:00:00:00:00') continue
    // Solo la red de casa: las redes internas de Docker también salen en la tabla.
    if (dev && iface !== dev) continue
    if (seen.has(ip)) continue
    seen.add(ip)
    devices.push({ ip, mac: mac.toLowerCase(), vendor: vendors.get(mac.toLowerCase()) })
  }
  return {
    self: m.self ? m.self.split('/')[0] : null,
    gateway: m.gw || null,
    devices: devices.sort((a, b) => lastOctet(a.ip) - lastOctet(b.ip)),
  }
}

/* --- Un mismo aparato visto por el router y por el amplificador ------------ */

/** Los 3 últimos pares de la MAC: «ab:cd:ef». */
export const macTail = (mac: string) => mac.toLowerCase().slice(-8)

export interface NetGroup {
  /** Clave del aparato: el final de su MAC, común a todas sus MAC. */
  key: string
  macs: string[]
  ips: string[]
  vendor?: string
}

/**
 * Junta las entradas que son el mismo aparato. Muchos amplificadores WiFi
 * reescriben la MAC de quien se conecta a ellos: ponen su propia primera mitad
 * y conservan la segunda (en casa, 98:00:11:ab:cd:ef por el router aparecía
 * también como 2e:11:22:ab:cd:ef por el amplificador, cada una con su IP). Sin
 * juntarlas, cada móvil salía dos veces. Que dos aparatos distintos coincidan
 * en esa mitad es 1 entre 16 millones.
 */
export function groupDevices(devices: NetDevice[]): NetGroup[] {
  const groups = new Map<string, NetGroup>()
  for (const d of devices) {
    const key = macTail(d.mac)
    const g = groups.get(key) ?? { key, macs: [], ips: [] }
    if (!g.macs.includes(d.mac)) g.macs.push(d.mac)
    if (!g.ips.includes(d.ip)) g.ips.push(d.ip)
    // El fabricante real es el de la MAC original, no el de la reescrita.
    g.vendor = g.vendor ?? d.vendor
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => lastOctet(a.ips[0]) - lastOctet(b.ips[0]))
}

/**
 * El nombre de un aparato: el guardado para cualquiera de sus MAC o, si no,
 * para otra MAC que acabe igual (se le puso nombre cuando iba por el otro
 * camino, router o amplificador).
 */
export function nameForGroup(g: NetGroup, names: Record<string, string>): string | undefined {
  for (const m of g.macs) if (names[m]) return names[m]
  for (const [mac, name] of Object.entries(names)) if (macTail(mac) === g.key) return name
  return undefined
}
