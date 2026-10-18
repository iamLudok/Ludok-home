// Cuentas del test de velocidad, sin red: qué tamaño pedir, cómo sacar la
// velocidad de las medidas y cómo decirlo. La parte que habla con la red está
// en `run.ts`; esta se prueba en `verify/speed.ts`.

/** Una petición medida: cuántos bytes y cuánto tardó, de principio a fin. */
export interface Sample {
  bytes: number
  ms: number
}

export type Direction = 'bajada' | 'subida'

/** Lo que dura cada sentido y lo que puede gastar como mucho. */
export interface PhasePlan {
  /** Se deja de pedir más cuando ya se lleva este tiempo midiendo. */
  maxMs: number
  /** Ni con 5G se pasa de aquí: con datos móviles son megas de la tarifa. */
  maxBytes: number
  /** La primera petición, pequeña: con una línea lenta no se queda esperando. */
  firstBytes: number
  /** Tope por petición (la Pi no acepta subidas de más de 30 MB). */
  maxRequestBytes: number
}

export const PLAN: Record<Direction, PhasePlan> = {
  bajada: { maxMs: 8000, maxBytes: 200_000_000, firstBytes: 100_000, maxRequestBytes: 50_000_000 },
  subida: { maxMs: 8000, maxBytes: 100_000_000, firstBytes: 100_000, maxRequestBytes: 25_000_000 },
}

/** Lo que tarda, como poco, una petición que cuenta para la velocidad. */
export const MIN_SAMPLE_MS = 300
/** Lo que se quiere que tarde cada petición: medidas largas, pocas esperas de ida y vuelta. */
const TARGET_MS = 1500

export function mbps(bytes: number, ms: number): number {
  return ms > 0 ? (bytes * 8) / ms / 1000 : 0
}

/**
 * Cuánto pedir después. Se apunta a peticiones de 1,5 s, pero sin multiplicar
 * por más de 8 de golpe: la primera petición se la come casi entera el ping, y
 * fiarse de ella llevaba a pedir de golpe muchísimo más de lo que la línea da.
 */
export function nextSize(last: Sample, plan: PhasePlan): number {
  const ideal = last.ms > 0 ? (last.bytes * TARGET_MS) / last.ms : last.bytes * 8
  const size = Math.min(ideal, last.bytes * 8, plan.maxRequestBytes)
  return Math.max(plan.firstBytes, Math.round(size))
}

/** Si ya no hay que pedir más: se ha agotado el tiempo o los megas del plan. */
export function phaseDone(samples: Sample[], elapsedMs: number, plan: PhasePlan): boolean {
  const used = samples.reduce((s, x) => s + x.bytes, 0)
  return elapsedMs >= plan.maxMs || used >= plan.maxBytes
}

/**
 * La velocidad de un sentido. Solo cuentan las peticiones de 300 ms o más: en
 * las cortas pesa más la ida y vuelta que la línea, y bajan la media sin que la
 * línea vaya más lenta. Si ninguna llega (línea rapidísima y poco que bajar, o
 * muy lenta y se acabó el tiempo), se usan todas, que es lo único que hay.
 * Bytes totales entre tiempo total y no la media de velocidades: así una
 * petición corta no pesa lo mismo que una de tres segundos.
 */
export function throughput(samples: Sample[]): number {
  const long = samples.filter((s) => s.ms >= MIN_SAMPLE_MS)
  const use = long.length ? long : samples
  const bytes = use.reduce((s, x) => s + x.bytes, 0)
  const ms = use.reduce((s, x) => s + x.ms, 0)
  return mbps(bytes, ms)
}

/**
 * Ping y jitter a partir de varias medidas. La primera se tira: en las de HTTP
 * abre la conexión (DNS, TCP, TLS) y no es el ping. El ping es la MÍNIMA, como
 * la latencia del test de Google (M-Lab da el mínimo): es lo que tarda la
 * línea sin colas; la mediana salía el doble y no se podía comparar. El jitter
 * es lo que varía de una medida a la siguiente.
 */
export function latency(ms: number[]): { pingMs: number; jitterMs: number } | null {
  const xs = ms.length > 1 ? ms.slice(1) : ms
  if (!xs.length) return null
  const pingMs = Math.min(...xs)
  let diff = 0
  for (let i = 1; i < xs.length; i++) diff += Math.abs(xs[i] - xs[i - 1])
  return { pingMs, jitterMs: xs.length > 1 ? diff / (xs.length - 1) : 0 }
}

/** «245 Mb/s», «38,5 Mb/s», «0,82 Mb/s». */
export function formatMbps(n: number): string {
  const s = n >= 100 ? String(Math.round(n)) : n >= 1 ? n.toFixed(1) : n.toFixed(2)
  return `${s.replace('.', ',')} Mb/s`
}

/** «12 ms», «0,8 ms»: hasta la Pi en casa el ping baja de 1 ms. */
export function formatMs(n: number): string {
  return n >= 10 ? `${Math.round(n)} ms` : `${n.toFixed(1).replace('.', ',')} ms`
}

export interface SpeedResult {
  downMbps: number
  upMbps: number
  pingMs: number
  jitterMs: number
  /** Lo que ha gastado el test en total, para saber lo que cuesta con datos. */
  bytes: number
  /** Dónde estaba el servidor: «Madrid (MAD)». */
  where?: string
}

/**
 * Lo que se puede hacer con esa conexión, como el resumen del test de Google.
 * Manda lo más flojo: con 300 de bajada y 120 ms de ping las videollamadas van
 * mal igual.
 */
export function verdict(r: Pick<SpeedResult, 'downMbps' | 'upMbps' | 'pingMs'>): string {
  if (r.downMbps < 1.5 || r.pingMs > 400) return 'Muy lenta: cuesta hasta cargar una web.'
  if (r.downMbps < 5 || r.upMbps < 1 || r.pingMs > 150) return 'Lenta: vale para webs y mensajes; el vídeo irá a trompicones.'
  if (r.downMbps < 25 || r.upMbps < 3 || r.pingMs > 60) return 'Normal: vídeo en HD y videollamadas en un aparato.'
  if (r.downMbps < 100 || r.upMbps < 10) return 'Rápida: vídeo en 4K y varias cosas a la vez.'
  return 'Muy rápida: puede con varios aparatos en 4K y descargas grandes a la vez.'
}

/**
 * Lo que el servidor dice que ha tardado en preparar la respuesta (cabecera
 * Server-Timing: «cfSpeedEdge;dur=3, cfSpeedWorker;dur=18»). En Cloudflare son
 * de 20 a 50 ms por petición: sin restarlos, un ping de 15 ms salía de 60 y el
 * resumen llamaba «normal» a una fibra.
 */
export function serverTimingMs(header: string | null): number {
  if (!header) return 0
  let total = 0
  for (const m of header.matchAll(/;\s*dur=([\d.]+)/g)) total += Number(m[1])
  return total
}

/** Centros de datos de Cloudflare que pueden tocar desde España. */
const COLOS: Record<string, string> = {
  MAD: 'Madrid',
  BCN: 'Barcelona',
  LIS: 'Lisboa',
  MRS: 'Marsella',
  CDG: 'París',
  LHR: 'Londres',
  FRA: 'Fráncfort',
  AMS: 'Ámsterdam',
  MXP: 'Milán',
}

/**
 * Dónde está el servidor de Cloudflare que ha contestado, a partir de la
 * cabecera CF-RAY («a4c8…-MAD»). Ya no mandan la ciudad en `cf-meta-city`.
 */
export function cloudflareWhere(ray: string | null): string | undefined {
  const code = ray?.match(/-([A-Z]{3})$/)?.[1]
  if (!code) return undefined
  return COLOS[code] ? `${COLOS[code]} (${code})` : code
}

/** Lo que podría gastar como mucho un test entero, para avisar con datos móviles. */
export function maxTestBytes(): number {
  return PLAN.bajada.maxBytes + PLAN.subida.maxBytes
}
