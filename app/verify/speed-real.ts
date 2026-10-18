/**
 * Test de velocidad de verdad, con el mismo código que la app: el del móvil
 * contra Cloudflare y, si se le da la Pi, el de la línea hecho por la Pi. NO va
 * en `npm run verify`: necesita red y gasta unos cientos de megas (la línea,
 * más de un giga por la fibra).
 *
 *   npx tsx verify/speed-real.ts
 *   LUDOK_DOCKER_URL=http://100.x.x.x:2375 LUDOK_DOCKER_PASSWORD=… npx tsx verify/speed-real.ts
 */
import { check, finish } from './harness'
import { formatMbps, formatMs, verdict, type SpeedResult } from '../src/lib/speed/core'
import { bytes } from '../src/lib/format'
import { CLOUDFLARE, runLineTest, runSpeedTest } from '../src/lib/speed/run'
import { diagnose } from '../src/lib/speed/line'
import { DockerApi } from '../src/lib/docker/api'

const url = process.env.LUDOK_DOCKER_URL ?? process.env.LUDOK_DOCKER_LAN_URL
const user = process.env.LUDOK_DOCKER_USER ?? 'ludok'
const password = process.env.LUDOK_DOCKER_PASSWORD

function show(r: SpeedResult) {
  console.log(
    `  bajada ${formatMbps(r.downMbps)} · subida ${formatMbps(r.upMbps)} · latencia ${formatMs(r.pingMs)} (jitter ${formatMs(r.jitterMs)}) · ${bytes(r.bytes)} · ${r.where ?? '?'}`,
  )
  check('bajada medida', r.downMbps > 0)
  check('subida medida', r.upMbps > 0)
  check('latencia medida', r.pingMs > 0)
  check('sabe dónde estaba el servidor', !!r.where, r.where)
}

async function main() {
  let line: SpeedResult | null = null
  // Primero la línea y luego el móvil, como en la app: a la vez se repartirían la fibra.
  if (url && password) {
    console.log('La línea, medida por la Pi (por cable)')
    line = await runLineTest(new DockerApi({ url, user, password }, fetch as never))
    show(line)
  } else {
    console.log('(sin LUDOK_DOCKER_PASSWORD: la línea no se prueba)')
  }

  console.log('\nEste equipo, contra Cloudflare')
  const phone = await runSpeedTest(fetch as never, CLOUDFLARE)
  show(phone)

  console.log(`\n  ${verdict(line ?? phone)}`)
  console.log(`  ${diagnose({ line, phone, net: 'wifi', contract: {} }).join('\n  ')}`)
  finish('verify:speed-real')
}

main()
