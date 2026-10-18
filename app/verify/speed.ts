/**
 * Test de velocidad, sin red: tamaños de petición, velocidad a partir de las
 * medidas, ping y jitter, formato y el resumen de qué se puede hacer. Y el test
 * entero contra un servidor falso con una línea de velocidad conocida.
 */
import { check, eq, finish } from './harness'
import { cloudflareWhere, formatMbps, formatMs, serverTimingMs, latency, mbps, nextSize, phaseDone, PLAN, throughput, verdict } from '../src/lib/speed/core'
import { runSpeedTest, type SpeedTarget } from '../src/lib/speed/run'
import { diagnose, LINE_SCRIPT, parseLineTest, type Contract, type NetKind } from '../src/lib/speed/line'
import type { SpeedResult } from '../src/lib/speed/core'

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

async function main() {
  console.log('Cuentas')
  eq('1 MB en 1 s son 8 Mb/s', mbps(1_000_000, 1000), 8)
  eq('sin tiempo no hay velocidad (ni división por cero)', mbps(1000, 0), 0)

  console.log('\nTamaño de la siguiente petición')
  const p = PLAN.bajada
  eq('apunta a 1,5 s: 1 MB en 0,5 s → 3 MB', nextSize({ bytes: 1_000_000, ms: 500 }, p), 3_000_000)
  eq('nunca más de ×8 de golpe, aunque la primera fuese instantánea', nextSize({ bytes: 100_000, ms: 5 }, p), 800_000)
  eq('con el tope por petición', nextSize({ bytes: 40_000_000, ms: 200 }, p), p.maxRequestBytes)
  eq('la subida, con el tope que acepta la Pi (30 MB)', nextSize({ bytes: 20_000_000, ms: 100 }, PLAN.subida), 25_000_000)
  eq('y nunca por debajo de la primera', nextSize({ bytes: 100_000, ms: 20_000 }, p), p.firstBytes)
  check('se para al acabar el tiempo', phaseDone([], p.maxMs, p))
  check('o al gastar los megas del plan', phaseDone([{ bytes: p.maxBytes, ms: 100 }], 100, p))
  check('si no, sigue', !phaseDone([{ bytes: 1000, ms: 100 }], 100, p))

  console.log('\nVelocidad de un sentido')
  // La primera, corta y lenta por el ping; las otras, de verdad a 80 Mb/s.
  const s = [
    { bytes: 100_000, ms: 60 },
    { bytes: 800_000, ms: 120 },
    { bytes: 10_000_000, ms: 1000 },
    { bytes: 15_000_000, ms: 1500 },
  ]
  eq('las peticiones cortas no cuentan', throughput(s), 80)
  eq('si todas son cortas, se usan todas', throughput(s.slice(0, 2)), mbps(900_000, 180))
  eq('sin medidas, 0', throughput([]), 0)

  console.log('\nPing y jitter')
  const l = latency([300, 20, 22, 18, 21, 19])
  eq('la primera (abrir la conexión) se tira y se usa la mínima, como Google', l?.pingMs, 18)
  eq('jitter: lo que varía de una a otra', l?.jitterMs, (2 + 4 + 3 + 2) / 4)
  eq('aunque la primera sea la más rápida, no cuenta', latency([5, 10, 30])?.pingMs, 10)
  eq('un pico suelto no la mueve', latency([99, 12, 13, 400, 12, 13])?.pingMs, 12)
  eq('sin medidas, nada', latency([]), null)

  console.log('\nFormato')
  eq('rápida, sin decimales', formatMbps(245.4), '245 Mb/s')
  eq('media, con coma', formatMbps(38.46), '38,5 Mb/s')
  eq('lenta, dos decimales', formatMbps(0.823), '0,82 Mb/s')
  eq('ping normal', formatMs(23.6), '24 ms')
  eq('ping hasta la Pi en casa', formatMs(1.84), '1,8 ms')

  eq(
    'tiempo del servidor: se suman los dur y se ignora cfL4',
    serverTimingMs('cfSpeedEdge;dur=3, cfSpeedWorker;dur=18.5, cfL4;desc="?proto=TCP&rtt=14302"'),
    21.5,
  )
  eq('sin cabecera, 0', serverTimingMs(null), 0)
  eq('servidor conocido, con nombre', cloudflareWhere('a4c832f2fd56c6df-MAD'), 'Madrid (MAD)')
  eq('desconocido, el código', cloudflareWhere('a4c832f2fd56c6df-NRT'), 'NRT')
  eq('sin cabecera, nada', cloudflareWhere(null), undefined)

  console.log('\nResumen')
  check('fibra', /^Muy rápida/.test(verdict({ downMbps: 600, upMbps: 500, pingMs: 8 })))
  check('buena bajada pero ping de satélite: manda lo peor', /^Lenta/.test(verdict({ downMbps: 300, upMbps: 50, pingMs: 200 })))
  check('4G flojo', /^Normal/.test(verdict({ downMbps: 15, upMbps: 4, pingMs: 45 })))
  check('casi sin cobertura', /^Muy lenta/.test(verdict({ downMbps: 0.8, upMbps: 0.2, pingMs: 300 })))

  console.log('\nEl test entero, contra una línea falsa de 40 Mb/s')
  // Servidor falso: cada petición «tarda» lo que tardaría a 40 Mb/s con 20 ms
  // de ping, adelantando el reloj en vez de esperar de verdad.
  let clock = 0
  const realNow = performance.now.bind(performance)
  performance.now = () => clock
  const LINE = 40
  const PING = 20
  const asked: number[] = []
  const fake = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: Uint8Array } = {}) => {
    const range = init.headers?.Range?.match(/bytes=0-(\d+)/)
    const n = init.body ? init.body.byteLength : range ? Number(range[1]) + 1 : 0
    if (url.includes('bajada') && range && n > 1) asked.push(n)
    clock += PING + (n * 8) / LINE / 1000
    let sent = false
    return {
      ok: init.headers?.Authorization === 'Basic buena',
      status: init.headers?.Authorization === 'Basic buena' ? (range ? 206 : 204) : 401,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: async () => (sent || init.body ? { done: true } : ((sent = true), { done: false, value: new Uint8Array(n) })),
          cancel: async () => {},
        }),
      },
      arrayBuffer: async () => new ArrayBuffer(init.body ? 0 : n),
    }
  }
  const target: SpeedTarget = {
    ping: () => ({ url: 'pi/velocidad/bajada', headers: { Authorization: 'Basic buena', Range: 'bytes=0-0' } }),
    down: (b) => ({ url: 'pi/velocidad/bajada', headers: { Authorization: 'Basic buena', Range: `bytes=0-${b - 1}` } }),
    up: () => ({ url: 'pi/velocidad/subida', headers: { Authorization: 'Basic buena' } }),
    where: 'WiFi de casa',
  }
  const phases = new Set<string>()
  const r = await runSpeedTest(fake as never, target, (pr) => phases.add(pr.phase))
  performance.now = realNow
  check('bajada cerca de 40 (el ping se come un poco)', near(r.downMbps, LINE, 2), formatMbps(r.downMbps))
  check('subida cerca de 40', near(r.upMbps, LINE, 2), formatMbps(r.upMbps))
  check('ping', near(r.pingMs, PING, 0.01), formatMs(r.pingMs))
  check('jitter de una línea estable', near(r.jitterMs, 0, 0.01), formatMs(r.jitterMs))
  eq('pasa por las tres fases, en orden', [...phases].join(','), 'ping,bajada,subida')
  check('las peticiones van creciendo', asked.every((n, i) => i === 0 || n >= asked[i - 1]), asked.join(', '))
  check('y no gasta más de lo que permite el plan', r.bytes <= PLAN.bajada.maxBytes + PLAN.subida.maxBytes + PLAN.bajada.maxRequestBytes)
  eq('dice dónde estaba', r.where, 'WiFi de casa')

  console.log('\nErrores')
  const bad = { ...target, ping: () => ({ url: 'pi', headers: { Authorization: 'Basic mala' } }) }
  const e = await runSpeedTest(fake as never, bad).catch((x) => x)
  check('contraseña mala, un error que se entiende', /contraseña/.test(e?.message), e?.message)
  const dead = async () => {
    throw new TypeError('Network request failed')
  }
  const e2 = await runSpeedTest(dead as never, target).catch((x) => x)
  check('sin red, «se ha cortado», no un error en inglés', /cortado/.test(e2?.message), e2?.message)
  const ctrl = new AbortController()
  ctrl.abort()
  const e3 = await runSpeedTest(dead as never, target, undefined, ctrl.signal).catch((x) => x)
  eq('cancelado', e3?.message, 'Cancelado')

  console.log('\nSi el servidor empieza a limitar a mitad')
  let calls = 0
  clock = 0
  performance.now = () => clock
  const limited = async (url: string, init: { headers?: Record<string, string>; body?: Uint8Array } = {}) => {
    calls++
    // Ping (11) y tres bajadas bien, la última ya larga; luego, la bajada limitada.
    if (calls > 14 && url.includes('bajada')) return { ok: false, status: 429, headers: { get: () => null }, body: null, arrayBuffer: async () => new ArrayBuffer(0) }
    return fake(url, init)
  }
  const lim = await runSpeedTest(limited as never, target).catch((x) => x)
  check('con medidas largas ya hechas, se queda con ellas', typeof lim?.downMbps === 'number' && near(lim.downMbps, LINE, 2), lim?.message ?? formatMbps(lim?.downMbps))
  calls = 100
  const lim2 = await runSpeedTest(limited as never, target).catch((x) => x)
  check('sin ninguna, un aviso que se entiende', /limitando/.test(lim2?.message), lim2?.message)
  performance.now = realNow

  console.log('\nLa línea, medida por la Pi')
  // Salida real del script en la Pi (por cable, Cloudflare en Madrid), con los números redondeados.
  const out = [
    'dev=eth0',
    'rx0=552000000000',
    'tx0=31000000000',
    ...[13.1, 12.0, 12.4, 12.2, 15.0, 12.3].map((p) => `ping=${p}`),
    'ray=a4c84e4208260329-MAD',
    'bajada=631578947 6128259.75 6128267.75',
    'subida=631578947 6128269.76 6128277.76',
    'rx1=553400000000',
    'tx1=31700000000',
  ].join('\n')
  const line = parseLineTest(out)
  check('bajada: bytes de la tarjeta sin cabeceras, entre los segundos', near(line.downMbps, 600, 0.5), formatMbps(line.downMbps))
  check('subida igual', near(line.upMbps, 600, 0.5), formatMbps(line.upMbps))
  eq('latencia: la mínima de los pings (sin el primero)', line.pingMs, 12)
  eq('servidor', line.where, 'Madrid (MAD)')
  eq('datos gastados: todo lo que ha pasado por la tarjeta', line.bytes, 1_400_000_000 + 700_000_000)
  const noPing = parseLineTest(out.split('\n').filter((l) => !l.startsWith('ping=')).join('\n'))
  eq('sin ping (hay redes que lo bloquean) el resto vale', Math.round(noPing.downMbps), 600)
  const offline = (() => {
    try {
      parseLineTest('dev=eth0\nbajada=1200 10 18\nsubida=900 20 28')
      return null
    } catch (x) {
      return x as Error
    }
  })()
  check('si la Pi no sale a internet, un error y no «0 Mb/s»', /no consigue salir/.test(offline?.message ?? ''), offline?.message)
  check('el script mide entre el arranque y el final, no desde el principio', /sleep 2; a=.*sleep 8; b=/.test(LINE_SCRIPT))

  console.log('\nConclusiones')
  const res = (down: number, up: number): SpeedResult => ({ downMbps: down, upMbps: up, pingMs: 10, jitterMs: 1, bytes: 1 })
  const say = (line: SpeedResult | null, phone: SpeedResult | null, net: NetKind, contract: Contract = { downMbps: 600, upMbps: 600 }) =>
    diagnose({ line, phone, net, contract }).join(' ')
  check('la línea cumple', /cumple: da el 98 % de la bajada y 99 % de la subida/.test(say(res(587, 594), res(500, 400), 'wifi')), say(res(587, 594), res(500, 400), 'wifi'))
  check('un poco por debajo', /un poco por debajo/.test(say(res(480, 590), null, 'wifi')))
  check('manda lo peor: la subida floja también cuenta', /no llega/.test(say(res(590, 300), null, 'wifi')))
  check('sin lo contratado, las cifras y que lo ponga', /da 587 de bajada.*contratado/.test(say(res(587, 594), null, 'wifi', {})))
  check('WiFi que se queda corta', /llegan 130 de los 587/.test(say(res(587, 594), res(130, 50), 'wifi')))
  check('WiFi que aprovecha la línea', /aprovecha bien/.test(say(res(587, 594), res(500, 400), 'wifi')))
  check('con datos móviles no se compara con la fibra', /datos móviles/.test(say(res(587, 594), res(80, 20), 'datos')))
  check('sin Pi, se dice que solo se midió el móvil', /solo el móvil/.test(say(null, res(130, 50), 'wifi')))

  finish('verify:speed')
}

main()
