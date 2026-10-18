// El test de velocidad contra un servidor: ping, bajada y subida. El `fetch`
// se recibe por parámetro, como en la API de Docker: en el móvil es el de
// `expo/fetch` (deja leer la bajada por trozos y ver la velocidad en directo);
// en `verify/speed-real.ts`, el de Node, con exactamente este código.
import { cloudflareWhere, latency, mbps, MIN_SAMPLE_MS, serverTimingMs, nextSize, phaseDone, PLAN, throughput, type Direction, type Sample, type SpeedResult } from './core'
import { LINE_SCRIPT, LINE_SECONDS, parseLineTest } from './line'
import { SELF_NAME } from '../docker/core'
import type { DockerApi } from '../docker/api'

interface ResponseLike {
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } } | null
  arrayBuffer(): Promise<ArrayBuffer>
}
type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array; signal?: AbortSignal },
) => Promise<ResponseLike>

interface Req {
  url: string
  headers?: Record<string, string>
}

/** Contra quién se mide: cómo se pide un ping, una bajada de N bytes y una subida. */
export interface SpeedTarget {
  ping(): Req
  down(bytes: number): Req
  up(): Req
  /** Dónde está, si se sabe ya. Si no, se saca de la respuesta al ping. */
  where?: string
  whereFrom?: (headers: ResponseLike['headers']) => string | undefined
  /** Lo que tardó el servidor en contestar, que no es tiempo de la línea. */
  serverMs?: (headers: ResponseLike['headers']) => number
}

/**
 * Internet: el servidor de Cloudflare más cercano. Sin cuenta ni clave; solo ve
 * la IP, como cualquier web. Elegido frente a M-Lab (el del test de Google)
 * porque M-Lab publica cada test con la IP en sus datos abiertos.
 */
export const CLOUDFLARE: SpeedTarget = {
  ping: () => ({ url: 'https://speed.cloudflare.com/__down?bytes=0' }),
  down: (bytes) => ({ url: `https://speed.cloudflare.com/__down?bytes=${bytes}` }),
  up: () => ({ url: 'https://speed.cloudflare.com/__up' }),
  whereFrom: (h) => cloudflareWhere(h.get('cf-ray')),
  serverMs: (h) => serverTimingMs(h.get('server-timing')),
}

export type Phase = 'ping' | Direction

export interface Progress {
  phase: Phase
  /** Velocidad que se lleva en este sentido (o el ping, en la fase de ping). */
  value: number
  /** De 0 a 1, lo que va de la fase. */
  fraction: number
}

export class SpeedError extends Error {}
class LimitedError extends SpeedError {}

const now = () => performance.now()

function check(res: ResponseLike, what: string): void {
  if (res.ok) return
  if (res.status === 401) throw new SpeedError('Usuario o contraseña de Docker incorrectos.')
  // Cloudflare corta con 403 o 429 a quien hace muchos tests seguidos.
  if (res.status === 403 || res.status === 429) throw new LimitedError('El servidor está limitando las pruebas: espera unos minutos y repite.')
  throw new SpeedError(`${what}: el servidor respondió ${res.status}.`)
}

/** Lo que tarda en ir y volver una petición vacía, diez veces. */
async function measurePing(fetchImpl: FetchLike, target: SpeedTarget, signal: AbortSignal | undefined, onProgress: (p: Progress) => void) {
  const times: number[] = []
  let where = target.where
  const N = 11
  for (let i = 0; i < N; i++) {
    const r = target.ping()
    const t0 = now()
    const res = await fetchImpl(r.url, { headers: r.headers, signal })
    await res.arrayBuffer()
    times.push(Math.max(0, now() - t0 - (target.serverMs?.(res.headers) ?? 0)))
    check(res, 'El ping')
    if (!where && target.whereFrom) where = target.whereFrom(res.headers)
    const l = latency(times)
    onProgress({ phase: 'ping', value: l?.pingMs ?? 0, fraction: (i + 1) / N })
  }
  const l = latency(times)
  if (!l) throw new SpeedError('No se pudo medir el ping.')
  return { ...l, where }
}

/**
 * Un sentido entero: peticiones cada vez más grandes hasta que se acaba el
 * tiempo o los megas. Una conexión y una petición detrás de otra, como el test
 * de Cloudflare; con varias en paralelo saldría algo más con fibra rápida,
 * pero el móvil no las usa así al navegar.
 */
async function measureDirection(
  fetchImpl: FetchLike,
  target: SpeedTarget,
  dir: Direction,
  signal: AbortSignal | undefined,
  onProgress: (p: Progress) => void,
): Promise<Sample[]> {
  const plan = PLAN[dir]
  const samples: Sample[] = []
  const start = now()
  let size = plan.firstBytes
  // Un solo búfer de subida, del tamaño máximo, y trozos de él: crear 25 MB
  // nuevos en cada petición hacía trabajar de más al recolector de basura.
  const payload = dir === 'subida' ? new Uint8Array(plan.maxRequestBytes) : null
  const report = (extra = 0) => {
    const elapsed = now() - start
    const done = samples.reduce((s, x) => s + x.bytes, 0) + extra
    // Mientras dura se enseña lo que va saliendo; al acabar cada petición, la
    // cuenta buena (la de `throughput`), para que el número no salte al final.
    const value = extra ? mbps(done, elapsed) : throughput(samples)
    onProgress({ phase: dir, value, fraction: Math.min(1, elapsed / plan.maxMs) })
  }

  while (!phaseDone(samples, now() - start, plan)) {
    if (signal?.aborted) throw new SpeedError('Cancelado')
    try {
      const sample = await oneRequest()
      samples.push(sample)
      report()
      size = nextSize(sample, plan)
    } catch (e) {
      // Si el servidor empieza a limitar a mitad y ya hay medidas largas, se
      // da por buena la fase con lo que hay en vez de tirar el test entero.
      if (e instanceof LimitedError && samples.some((s) => s.ms >= MIN_SAMPLE_MS)) break
      throw e
    }
  }
  return samples

  async function oneRequest(): Promise<Sample> {
    const t0 = now()
    let got = 0
    if (dir === 'bajada') {
      const r = target.down(size)
      const res = await fetchImpl(r.url, { headers: r.headers, signal })
      check(res, 'La bajada')
      const reader = res.body?.getReader()
      if (reader) {
        let last = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          got += value?.byteLength ?? 0
          if (now() - last > 200) {
            last = now()
            report(got)
          }
        }
      } else {
        got = (await res.arrayBuffer()).byteLength
      }
    } else {
      const r = target.up()
      const res = await fetchImpl(r.url, {
        method: 'POST',
        headers: { ...r.headers, 'Content-Type': 'application/octet-stream' },
        body: payload!.subarray(0, size),
        signal,
      })
      await res.arrayBuffer()
      check(res, 'La subida')
      got = size
    }
    return { bytes: got, ms: now() - t0 }
  }
}

/**
 * El test de la línea, hecho por la Pi (ver `line.ts`). Tarda unos 25 s y no
 * dice nada hasta acabar: la API de Docker devuelve la salida del exec entera.
 */
export async function runLineTest(api: DockerApi): Promise<SpeedResult> {
  const { output } = await api.exec(SELF_NAME, LINE_SCRIPT, (LINE_SECONDS + 30) * 1000)
  return parseLineTest(output)
}

/** El test entero: ping, bajada y subida, por ese orden (como el de Google). */
export async function runSpeedTest(
  fetchImpl: FetchLike,
  target: SpeedTarget,
  onProgress: (p: Progress) => void = () => {},
  signal?: AbortSignal,
): Promise<SpeedResult> {
  try {
    const ping = await measurePing(fetchImpl, target, signal, onProgress)
    const down = await measureDirection(fetchImpl, target, 'bajada', signal, onProgress)
    const up = await measureDirection(fetchImpl, target, 'subida', signal, onProgress)
    const bytes = [...down, ...up].reduce((s, x) => s + x.bytes, 0)
    return {
      pingMs: ping.pingMs,
      jitterMs: ping.jitterMs,
      downMbps: throughput(down),
      upMbps: throughput(up),
      bytes,
      where: ping.where,
    }
  } catch (e) {
    if (e instanceof SpeedError) throw e
    if (signal?.aborted) throw new SpeedError('Cancelado')
    throw new SpeedError('Se ha cortado la conexión a mitad del test.')
  }
}
