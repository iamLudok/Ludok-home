/**
 * Prueba contra un Docker de verdad (la Pi), con un contenedor de usar y tirar.
 * NO va en `npm run verify`: necesita red y credenciales, y descarga imágenes.
 *
 *   LUDOK_DOCKER_URL=http://100.x.x.x:2375 LUDOK_DOCKER_USER=ludok \
 *   LUDOK_DOCKER_PASSWORD=… npx tsx verify/docker-real.ts
 *
 * Usa redis porque guarda sus datos en un volumen ANÓNIMO, el caso que más
 * fácil se rompe al actualizar: se escribe un fichero, se actualiza de versión
 * y el fichero tiene que seguir ahí. No toca ningún otro contenedor.
 */
import { check, eq, finish } from './harness'
import { DockerApi, DockerError } from '../src/lib/docker/api'
import { composeYaml, nameOf } from '../src/lib/docker/core'

const NAME = 'ludok-prueba'
const OLD = 'redis:7.2-alpine'
const NEW = 'redis:7.4-alpine'
const PORT = 16379

const url = process.env.LUDOK_DOCKER_URL
// Opcional: para probar la entrada por la WiFi de casa cuando Tailscale no responde.
const lanUrl = process.env.LUDOK_DOCKER_LAN_URL
const user = process.env.LUDOK_DOCKER_USER ?? 'ludok'
const password = process.env.LUDOK_DOCKER_PASSWORD
if (!url || !password) {
  console.error('Faltan LUDOK_DOCKER_URL y LUDOK_DOCKER_PASSWORD.')
  process.exit(2)
}

const api = new DockerApi({ url, lanUrl, user, password }, fetch as never)
const raw = async (path: string, init: RequestInit = {}) =>
  fetch((api.via === 'casa' ? lanUrl! : url) + path, { ...init, headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64'), 'Content-Type': 'application/json' } })

async function cleanup() {
  for (const n of [NAME, `${NAME}_old`]) {
    const c = await api.inspect(n).catch(() => null)
    if (!c) continue
    await api.remove(c.Id).catch(() => {})
    for (const m of c.Mounts) if (m.Type === 'volume' && m.Name) await raw(`/volumes/${m.Name}`, { method: 'DELETE' }).catch(() => {})
  }
}

async function main() {
  console.log('Conexión')
  const v = await api.version()
  check('responde con contraseña', !!v.Version, `Docker ${v.Version}, por ${api.via}`)
  const bad = new DockerApi({ url: url!, lanUrl, user, password: 'mala' }, fetch as never)
  const err = await bad.list().catch((e) => e)
  check('con contraseña mala, un error que se entiende', err instanceof DockerError && /contraseña/.test(err.message), err?.message)
  check('el listado incluye la puerta de la API', (await api.list()).some((c) => nameOf(c) === 'ludok-docker-api'))

  await cleanup()
  console.log('\nContenedor de prueba con la versión vieja')
  await api.pull(OLD)
  const created = await raw(`/containers/create?name=${NAME}`, {
    method: 'POST',
    body: JSON.stringify({
      Image: OLD,
      Labels: { 'ludok.prueba': 'sí' },
      HostConfig: { PortBindings: { '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: String(PORT) }] }, RestartPolicy: { Name: 'unless-stopped' } },
    }),
  })
  check('creado', created.ok, String(created.status))
  await api.start(NAME)
  await new Promise((r) => setTimeout(r, 2500))

  const w = await api.exec(NAME, 'echo persiste > /data/prueba.txt && cat /data/prueba.txt')
  eq('exec escribe en el volumen anónimo', w.output.trim(), 'persiste')
  eq('exec con éxito da código 0', w.exitCode, 0)
  const fail = await api.exec(NAME, 'echo fallo >&2; exit 3')
  eq('exec que falla da su código', fail.exitCode, 3)
  check('y su salida de error', fail.output.includes('fallo'))

  const logs = await api.logs(NAME, 50)
  check('logs legibles, sin cabeceras binarias', /Ready to accept connections/.test(logs) && !logs.includes('\u0001\u0000'), logs.slice(-80))

  const ports = await api.listeningPorts()
  check('el puerto de prueba aparece ocupado en la Pi', ports.some((p) => p.port === PORT && p.proto === 'tcp'))
  check('y el 22 de SSH también (se ven los de la Pi, no solo contenedores)', ports.some((p) => p.port === 22))

  const before = await api.inspect(NAME)
  const yaml = composeYaml(before, (await api.image(before.Image))?.Config ?? null)
  check('compose generado con su puerto', yaml.includes(`"127.0.0.1:${PORT}:6379"`), yaml)
  const upd = await api.checkUpdate(before)
  check('comprobar actualización responde', ['al-dia', 'disponible', 'descargada', 'desconocida'].includes(upd.state), upd.state)

  console.log('\nActualizar a otra versión')
  const steps: string[] = []
  await api.update(NAME, NEW, (s) => steps.push(s), 8)
  const after = await api.inspect(NAME)
  eq('con la imagen nueva', after.Config.Image, NEW)
  check('en marcha', after.State.Running)
  check('es otro contenedor', after.Id !== before.Id)
  eq('conserva la política de reinicio', after.HostConfig.RestartPolicy?.Name, 'unless-stopped')
  eq('conserva el puerto', after.HostConfig.PortBindings?.['6379/tcp']?.[0]?.HostPort, String(PORT))
  eq('conserva tu etiqueta', after.Config.Labels?.['ludok.prueba'], 'sí')
  const read = await api.exec(NAME, 'cat /data/prueba.txt')
  eq('LOS DATOS SIGUEN AHÍ (volumen anónimo reenganchado)', read.output.trim(), 'persiste')
  check('no queda el «_old»', !(await api.inspect(`${NAME}_old`).then(() => true, () => false)))
  check('pasó por todos los pasos', steps.some((s) => /aguanta/.test(s)), steps.join(' / '))

  console.log('\nSi la actualización falla, el viejo se queda como estaba')
  const failed = await api.update(NAME, 'redis:esta-version-no-existe', () => {}, 5).then(() => null, (e) => e)
  check('falla con un error', failed instanceof DockerError, failed?.message)
  const still = await api.inspect(NAME)
  eq('el mismo contenedor de antes', still.Id, after.Id)
  check('sigue en marcha', still.State.Running)
  eq('con su nombre', nameOf(still), NAME)

  console.log('\nSi el nuevo se cae al arrancar, se deshace todo')
  // alpine sin nada que ejecutar sale al instante: falla DESPUÉS de haber
  // parado y renombrado el viejo, que es el caso de verdad peligroso.
  const crashed = await api.update(NAME, 'alpine:3.20', () => {}, 6).then(() => null, (e) => e)
  check('falla diciendo que el nuevo se ha parado', crashed instanceof DockerError && /parado|bucle|enfermo/.test(crashed.message), crashed?.message)
  const back = await api.inspect(NAME)
  eq('vuelve el contenedor de antes', back.Id, after.Id)
  check('en marcha otra vez', back.State.Running)
  eq('con su nombre (no «_old»)', nameOf(back), NAME)
  eq('y sus datos', (await api.exec(NAME, 'cat /data/prueba.txt')).output.trim(), 'persiste')
  check('sin restos del intento', !(await api.list()).some((c) => nameOf(c) === `${NAME}_old`))
  await raw(`/images/${encodeURIComponent('alpine:3.20')}`, { method: 'DELETE' }).catch(() => {})

  console.log('\nParar, arrancar, reiniciar')
  await api.stop(NAME, 2)
  check('parado', !(await api.inspect(NAME)).State.Running)
  await api.start(NAME)
  check('arrancado', (await api.inspect(NAME)).State.Running)
  const startedAt = (await api.inspect(NAME)).State.StartedAt
  await api.restart(NAME, 2)
  check('reiniciado', (await api.inspect(NAME)).State.StartedAt !== startedAt)

  console.log('\nLimpieza')
  await cleanup()
  check('contenedor de prueba eliminado', !(await api.inspect(NAME).then(() => true, () => false)))
  for (const img of [OLD, NEW]) {
    const found = await api.image(img)
    if (found) await api.removeImage(found.Id)
  }
  check('imágenes de prueba borradas con removeImage', !(await api.image(OLD)) && !(await api.image(NEW)))

  finish('verify:docker-real')
}

main().catch(async (e) => {
  console.error(e)
  await cleanup().catch(() => {})
  process.exit(1)
})
