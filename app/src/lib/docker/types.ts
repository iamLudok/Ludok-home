// Lo que la app usa de la API de Docker Engine (v1.4x+). Solo los campos que se
// leen: la API devuelve muchos más y declararlos todos solo haría creer que se
// usan.

export interface PortSummary {
  IP?: string
  PrivatePort: number
  PublicPort?: number
  Type: 'tcp' | 'udp' | string
}

/** Un elemento de GET /containers/json */
export interface ContainerSummary {
  Id: string
  Names: string[]
  /** Nombre de la imagen, o su ID si la etiqueta ya apunta a otra imagen. */
  Image: string
  ImageID: string
  State: 'running' | 'exited' | 'paused' | 'restarting' | 'created' | 'removing' | 'dead' | string
  /** Texto humano: «Up 2 weeks (healthy)», «Exited (0) 3 hours ago». */
  Status: string
  Labels: Record<string, string> | null
  Ports: PortSummary[]
  Created: number
}

export interface HealthcheckConfig {
  Test?: string[]
  Interval?: number
  Timeout?: number
  Retries?: number
  StartPeriod?: number
}

/** Config de un contenedor o de una imagen (comparten forma). */
export interface ImageLikeConfig {
  Image?: string
  Hostname?: string
  User?: string
  Env?: string[] | null
  Cmd?: string[] | null
  Entrypoint?: string[] | null
  WorkingDir?: string
  Labels?: Record<string, string> | null
  ExposedPorts?: Record<string, object> | null
  Volumes?: Record<string, object> | null
  Healthcheck?: HealthcheckConfig | null
  Tty?: boolean
  OpenStdin?: boolean
  StopSignal?: string
  StopTimeout?: number
  [key: string]: unknown
}

export interface MountPoint {
  Type: 'bind' | 'volume' | 'tmpfs' | string
  Name?: string
  Source: string
  Destination: string
  RW: boolean
  Mode?: string
}

export interface EndpointSettings {
  IPAMConfig?: { IPv4Address?: string; IPv6Address?: string } | null
  Aliases?: string[] | null
  MacAddress?: string
  IPAddress?: string
  [key: string]: unknown
}

/** GET /containers/{id}/json */
export interface ContainerInspect {
  Id: string
  /** Con barra delante: «/vaultwarden». */
  Name: string
  Created: string
  /** ID de la imagen con la que se creó. */
  Image: string
  RestartCount: number
  State: {
    Status: string
    Running: boolean
    Paused: boolean
    Restarting: boolean
    ExitCode: number
    StartedAt: string
    FinishedAt: string
    Health?: { Status: 'healthy' | 'unhealthy' | 'starting' | string } | null
  }
  Config: ImageLikeConfig
  HostConfig: Record<string, unknown> & {
    NetworkMode?: string
    RestartPolicy?: { Name: string; MaximumRetryCount?: number }
    PortBindings?: Record<string, { HostIp?: string; HostPort?: string }[] | null> | null
    Binds?: string[] | null
    Privileged?: boolean
    CapAdd?: string[] | null
    Devices?: { PathOnHost: string; PathInContainer: string; CgroupPermissions?: string }[] | null
    ExtraHosts?: string[] | null
  }
  Mounts: MountPoint[]
  NetworkSettings: { Networks: Record<string, EndpointSettings> | null }
}

/** GET /images/{name}/json */
export interface ImageInspect {
  Id: string
  RepoTags: string[] | null
  RepoDigests: string[] | null
  Created?: string
  Config: ImageLikeConfig | null
}

export interface DiskImage {
  Id: string
  /** Cuántos contenedores (en marcha o parados) la usan. */
  Containers: number
  Size: number
  /** Capas compartidas con otras imágenes: no se liberan mientras alguna las use. */
  SharedSize?: number
  RepoTags?: string[] | null
  RepoDigests?: string[] | null
  Created?: number
}

/** GET /system/df (lo que se puede limpiar) */
export interface DiskUsage {
  LayersSize?: number
  Images?: DiskImage[] | null
  Containers?: { Id: string; State: string; SizeRw?: number }[] | null
  Volumes?: { Name: string; UsageData?: { RefCount: number; Size: number } | null }[] | null
  BuildCache?: { InUse: boolean; Size: number }[] | null
}
