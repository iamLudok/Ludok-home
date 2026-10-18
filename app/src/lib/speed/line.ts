// El test de la LÍNEA: lo hace la Pi, que va por cable al router, para saber
// si la operadora da lo contratado. Desde el móvil no se puede: la WiFi casi
// siempre da menos que la fibra y no se sabría de quién es la culpa.
//
// Sin nada instalado en la Pi: se ejecuta dentro del contenedor de la API de
// Docker (que ya trae curl y ping y va con la red del sistema), como el estado
// de la Pi y la red de casa. Aquí solo el script y las cuentas, sin red: se
// prueba en `verify/speed.ts`.
import { cloudflareWhere, latency, mbps, type SpeedResult } from './core'

/** Conexiones a la vez: con una sola, una fibra de 600 no se llena y parecería que la operadora no cumple. */
export const LINE_STREAMS = 6
/** Lo que dura cada sentido: 2 s de arranque que no cuentan y 8 s que sí. */
const WARM_S = 2
const MEASURE_S = 8

/**
 * Lo que se cuenta son los bytes de la tarjeta de red de la Pi (los
 * contadores de /sys), no lo que dice curl: así da igual que cada conexión
 * vaya por su cuenta, y se deja fuera el arranque de cada una. Cada conexión
 * pide trozos de 50 MB en bucle (Cloudflare no da más de 100 MB por petición)
 * hasta su hora de acabar; con `timeout` en vez de la hora, el curl que
 * estuviese a medias seguía bajando y ensuciaba la medida de la subida.
 * La subida manda ceros sin fin (-T /dev/zero, en trozos) hasta la hora.
 */
export const LINE_SCRIPT = String.raw`
dev=$(awk '$2=="00000000"{print $1; exit}' /proc/net/route)
S=/sys/class/net/$dev/statistics
now() { cut -d' ' -f1 /proc/uptime; }
echo "dev=$dev"
echo "rx0=$(cat $S/rx_bytes)"
echo "tx0=$(cat $S/tx_bytes)"
ping -c 11 -i 0.2 -W 2 speed.cloudflare.com 2>/dev/null | sed -n 's/.*time=\([0-9.]*\).*/ping=\1/p'
echo "ray=$(curl -sI --max-time 5 'https://speed.cloudflare.com/__down?bytes=0' | tr -d '\r' | awk -F': ' 'tolower($1)=="cf-ray"{print $2}')"
end=$(( $(date +%s) + ${WARM_S + MEASURE_S + 1} ))
for i in $(seq ${LINE_STREAMS}); do
  while [ $(date +%s) -lt $end ]; do curl -s -o /dev/null --max-time $(( end - $(date +%s) + 1 )) 'https://speed.cloudflare.com/__down?bytes=50000000'; done &
done
sleep ${WARM_S}; a=$(cat $S/rx_bytes); ta=$(now); sleep ${MEASURE_S}; b=$(cat $S/rx_bytes); tb=$(now)
echo "bajada=$((b - a)) $ta $tb"
wait
end=$(( $(date +%s) + ${WARM_S + MEASURE_S + 1} ))
for i in $(seq ${LINE_STREAMS}); do
  curl -s -o /dev/null --max-time $(( end - $(date +%s) )) -X POST -H 'Content-Type: application/octet-stream' -T /dev/zero 'https://speed.cloudflare.com/__up' &
done
sleep ${WARM_S}; a=$(cat $S/tx_bytes); ta=$(now); sleep ${MEASURE_S}; b=$(cat $S/tx_bytes); tb=$(now)
echo "subida=$((b - a)) $ta $tb"
wait
echo "rx1=$(cat $S/rx_bytes)"
echo "tx1=$(cat $S/tx_bytes)"
`.trim()

/** Lo que tarda el script, para la barra de progreso (la Pi no avisa a mitad). */
export const LINE_SECONDS = 3 + 2 * (WARM_S + MEASURE_S + 1)

/**
 * Los contadores de la tarjeta cuentan también las cabeceras de Ethernet, IP y
 * TCP: de cada 1514 bytes, 1448 son datos (IPv4; con IPv6, 1428). Google y
 * Cloudflare dan solo los datos, así que se descuenta para que las cifras se
 * puedan comparar con las del móvil y con las de cualquier otro test.
 */
export const PAYLOAD_RATIO = 0.95

/** Por debajo de esto no ha salido nada a internet: es un fallo, no una línea lenta. */
const MIN_BYTES = 100_000

export class LineError extends Error {}

export function parseLineTest(out: string): SpeedResult {
  const pings: number[] = []
  const m: Record<string, string> = {}
  for (const raw of out.split('\n')) {
    const line = raw.trim()
    const i = line.indexOf('=')
    if (i <= 0) continue
    const k = line.slice(0, i)
    const v = line.slice(i + 1).trim()
    if (k === 'ping') pings.push(Number(v))
    else m[k] = v
  }
  const rate = (v: string | undefined) => {
    const [b, t0, t1] = (v ?? '').split(/\s+/).map(Number)
    if (!(b >= MIN_BYTES) || !(t1 > t0)) return null
    return mbps(b * PAYLOAD_RATIO, (t1 - t0) * 1000)
  }
  const down = rate(m.bajada)
  const up = rate(m.subida)
  if (down === null || up === null) throw new LineError('La Pi no consigue salir a internet: no ha podido bajar ni subir nada.')
  // Sin ping (hay redes que lo bloquean) el resto vale igual.
  const l = latency(pings.filter((x) => Number.isFinite(x)))
  const used = Number(m.rx1) - Number(m.rx0) + (Number(m.tx1) - Number(m.tx0))
  return {
    downMbps: down,
    upMbps: up,
    pingMs: l?.pingMs ?? 0,
    jitterMs: l?.jitterMs ?? 0,
    bytes: Number.isFinite(used) && used > 0 ? used : 0,
    where: cloudflareWhere(m.ray || null),
  }
}

export type NetKind = 'wifi' | 'datos' | 'otra'

export interface Contract {
  downMbps?: number
  upMbps?: number
}

/** Lo que va por debajo de lo contratado sin que sea para preocuparse. */
const OK_RATIO = 0.9
/** Por debajo de esto ya no es «un poco»: hay que reclamar si se repite. */
const BAD_RATIO = 0.7
/** La WiFi aprovecha bien la línea si da al menos esto de ella. */
const WIFI_OK = 0.7

const pct = (a: number, b: number) => Math.round((100 * a) / b)
const short = (n: number) => String(Math.round(n))

/**
 * Las conclusiones del test doble, en frases. Lo que importa: si la línea da
 * lo contratado (para eso se mide desde la Pi, por cable) y, si el móvil va
 * más lento, si la culpa es de la WiFi.
 */
export function diagnose(input: { line: SpeedResult | null; phone: SpeedResult | null; net: NetKind; contract: Contract }): string[] {
  const { line, phone, net, contract } = input
  const out: string[] = []
  if (line) {
    const c = contract
    if (c.downMbps) {
      const d = line.downMbps / c.downMbps
      const u = c.upMbps ? line.upMbps / c.upMbps : 1
      const worst = Math.min(d, u)
      const detail = c.upMbps
        ? `${pct(line.downMbps, c.downMbps)} % de la bajada y ${pct(line.upMbps, c.upMbps)} % de la subida contratadas`
        : `${pct(line.downMbps, c.downMbps)} % de la bajada contratada`
      if (worst >= OK_RATIO) out.push(`La línea cumple: da el ${detail}.`)
      else if (worst >= BAD_RATIO) out.push(`La línea va un poco por debajo: da el ${detail}. Si se repite a otras horas, reclama.`)
      else out.push(`La línea no llega a lo contratado: da el ${detail}. Si se repite a otras horas, reclama a la operadora.`)
    } else {
      out.push(`La línea da ${short(line.downMbps)} de bajada y ${short(line.upMbps)} de subida. Pon lo que tienes contratado para saber si cumple.`)
    }
  } else {
    out.push('No se ha llegado a la Pi, así que la línea no se ha medido: solo el móvil.')
  }
  if (phone && line) {
    if (net === 'datos') out.push('El móvil va con datos móviles: su resultado no es la fibra de casa.')
    else if (phone.downMbps >= line.downMbps * WIFI_OK) out.push('La WiFi aprovecha bien la línea.')
    else
      out.push(
        `Por WiFi al móvil le llegan ${short(phone.downMbps)} de los ${short(line.downMbps)} de la línea: si quieres más, acércate al router o al amplificador.`,
      )
  }
  return out
}
