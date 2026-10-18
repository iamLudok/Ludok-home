/**
 * Reglas de la pantalla Servidor, sin red: estado, agrupar por proyecto,
 * flujo binario de logs/exec, actualizaciones, recreación, compose, puertos y
 * qué ha cambiado desde la última vez.
 *
 * Los datos de prueba tienen la forma que devuelve la API de Docker 29 de la Pi
 * (comprobada con curl), con valores inventados.
 */
import { check, eq, finish } from './harness'
import {
  composeYaml,
  demux,
  diffSnapshots,
  groupByProject,
  hostPorts,
  imageVersion,
  isPortFree,
  parseImageRef,
  parseNetstat,
  randomFreePort,
  recreatePlan,
  riskOf,
  snapshotOf,
  spanishDuration,
  classifyUnusedImages,
  groupDevices,
  nameForGroup,
  hostReadings,
  parseHostStats,
  parseNetworkScan,
  normalizeRef,
  stateFromInspect,
  humanSpan,
  stateOf,
  updateState,
  utf8,
} from '../src/lib/docker/core'
import type { ContainerInspect, ContainerSummary, ImageLikeConfig } from '../src/lib/docker/types'
import { DockerApi, DockerError } from '../src/lib/docker/api'
import { isRandomMac } from '../src/lib/devices'

const summary = (over: Partial<ContainerSummary>): ContainerSummary => ({
  Id: 'abc', Names: ['/x'], Image: 'x', ImageID: 'sha256:1', State: 'running', Status: 'Up 2 weeks',
  Labels: {}, Ports: [], Created: 0, ...over,
})

const IMAGE_CFG: ImageLikeConfig = {
  Env: ['PATH=/usr/bin', 'APP_VERSION=1.2.3'],
  Cmd: ['serve'],
  Entrypoint: ['/entrypoint.sh'],
  WorkingDir: '/app',
  Labels: { 'org.opencontainers.image.version': '1.2.3', maintainer: 'x' },
  ExposedPorts: { '80/tcp': {} },
  Volumes: { '/data': {} },
  Healthcheck: { Test: ['CMD', 'curl', '-f', 'http://localhost'] },
}

const inspect = (over: Partial<ContainerInspect> = {}): ContainerInspect => ({
  Id: 'f00dcafe1234567890',
  Name: '/vaultwarden',
  Created: '2026-09-01T00:00:00Z',
  Image: 'sha256:old',
  RestartCount: 0,
  State: { Status: 'running', Running: true, Paused: false, Restarting: false, ExitCode: 0, StartedAt: '2026-10-01T00:00:00Z', FinishedAt: '' },
  Config: {
    Image: 'vaultwarden/server:latest',
    Hostname: 'f00dcafe1234',
    Env: ['PATH=/usr/bin', 'APP_VERSION=1.2.3', 'ADMIN_TOKEN=secreto', 'DOMAIN=https://vault.casa'],
    Cmd: ['serve'],
    Entrypoint: ['/entrypoint.sh'],
    WorkingDir: '/app',
    Labels: {
      'org.opencontainers.image.version': '1.2.3',
      maintainer: 'x',
      'com.docker.compose.project': 'vaultwarden',
      'com.docker.compose.service': 'vaultwarden',
      'mi.etiqueta': 'sí',
    },
    ExposedPorts: { '80/tcp': {}, '3012/tcp': {} },
    Volumes: { '/data': {} },
    Healthcheck: { Test: ['CMD', 'curl', '-f', 'http://localhost'] },
  },
  HostConfig: {
    NetworkMode: 'vaultwarden_default',
    RestartPolicy: { Name: 'unless-stopped' },
    PortBindings: { '80/tcp': [{ HostIp: '', HostPort: '8081' }], '3012/tcp': [{ HostIp: '127.0.0.1', HostPort: '3012' }] },
    Binds: ['/home/luken/vw:/config:ro'],
  },
  Mounts: [
    { Type: 'bind', Source: '/home/luken/vw', Destination: '/config', RW: false },
    { Type: 'volume', Name: 'a1b2c3anon', Source: '/var/lib/docker/volumes/a1b2c3anon/_data', Destination: '/data', RW: true },
  ],
  NetworkSettings: {
    Networks: {
      vaultwarden_default: { Aliases: ['vaultwarden', 'f00dcafe1234'], IPAMConfig: null },
      proxy: { Aliases: ['vw'], IPAMConfig: { IPv4Address: '172.30.0.10' }, MacAddress: '02:42:ac:1e:00:0a' },
    },
  },
  ...over,
})

function stateRules() {
  console.log('Estado')
  const up = stateOf(summary({ State: 'running', Status: 'Up 2 weeks (healthy)' }))
  eq('en marcha', up.run, 'en-marcha')
  eq('sano', up.health, 'sano')
  eq('desde hace', up.since, '2 semanas')
  eq('mala salud', stateOf(summary({ Status: 'Up 3 hours (unhealthy)' })).health, 'mal')
  eq('arrancando la salud', stateOf(summary({ Status: 'Up 5 seconds (health: starting)' })).health, 'arrancando')
  const exited = stateOf(summary({ State: 'exited', Status: 'Exited (137) 3 days ago' }))
  eq('parado', exited.run, 'parado')
  eq('parado desde hace', exited.since, '3 días')
  eq('«About an hour» en castellano', spanishDuration('About an hour'), '1 h')
  eq('«1 week» en singular', spanishDuration('1 week'), '1 semana')
  eq('«Less than a second»', spanishDuration('Less than a second'), 'un momento')
  eq('lo que no entiende lo deja', spanishDuration('ayer'), 'ayer')
  eq('reiniciándose', stateOf(summary({ State: 'restarting', Status: 'Restarting (1) 5 seconds ago' })).run, 'reiniciando')
  const now = Date.parse('2026-10-15T00:00:00Z')
  const fromInspect = stateFromInspect(inspect({ State: { ...inspect().State, Health: { Status: 'unhealthy' } } }), now)
  eq('desde el inspect: mala salud', fromInspect.health, 'mal')
  eq('desde el inspect: cuánto lleva en marcha', fromInspect.since, '2 semanas')
  eq('parado desde el inspect usa cuándo se paró', stateFromInspect(inspect({ State: { ...inspect().State, Status: 'exited', Running: false, FinishedAt: '2026-10-14T21:00:00Z' } }), now).since, '3 h')
  eq('un instante', humanSpan(500), 'un momento')
  eq('un día en singular', humanSpan(86_400_000 + 5000), '1 día')

  const ports = hostPorts(summary({ Ports: [
    { IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' },
    { IP: '::', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' },
    { PrivatePort: 9000, Type: 'tcp' },
    { IP: '0.0.0.0', PrivatePort: 53, PublicPort: 53, Type: 'udp' },
  ] }))
  eq('puertos sin el duplicado IPv4/IPv6 ni los no publicados', ports.map((p) => `${p.host}/${p.proto}`).join(), '53/udp,8080/tcp')

  const groups = groupByProject([
    summary({ Names: ['/immich_server'], Labels: { 'com.docker.compose.project': 'immich' } }),
    summary({ Names: ['/duckdns'], Labels: null }),
    summary({ Names: ['/immich_redis'], Labels: { 'com.docker.compose.project': 'immich' } }),
    summary({ Names: ['/nextcloud-app-1'], Labels: { 'com.docker.compose.project': 'nextcloud' } }),
  ])
  eq('proyectos en orden y los sueltos al final', groups.map((g) => g.project ?? 'sueltos').join(), 'immich,nextcloud,sueltos')
  eq('contenedores en orden dentro del proyecto', groups[0].containers.map((c) => c.Names[0]).join(), '/immich_redis,/immich_server')
}

function streamRules() {
  console.log('\nFlujo de logs y exec')
  const frame = (stream: number, text: string) => {
    const body = [...Buffer.from(text, 'utf8')]
    const n = body.length
    return [stream, 0, 0, 0, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...body]
  }
  // Los mismos bytes que devolvió `exec` en la Pi con «echo hola; echo error >&2».
  const exec = new Uint8Array([...frame(1, 'hola\n'), ...frame(2, 'error\n')])
  const d = demux(exec)
  eq('stdout', d.stdout, 'hola\n')
  eq('stderr', d.stderr, 'error\n')
  eq('las dos en orden', d.all, 'hola\nerror\n')
  eq('acentos y emojis en UTF-8', demux(new Uint8Array(frame(1, 'Descarga: año 2026 ✓ 🐳\n'))).all, 'Descarga: año 2026 ✓ 🐳\n')
  eq('con TTY no hay cabeceras: texto tal cual', demux(new Uint8Array(Buffer.from('línea normal\n'))).all, 'línea normal\n')
  const big = 'x'.repeat(70000)
  eq('un trozo de más de 64 KB', demux(new Uint8Array(frame(1, big))).all.length, 70000)
  eq('un carácter cortado al final no revienta', utf8(new Uint8Array([0x61, 0xc3])), 'a�')
  eq('flujo vacío', demux(new Uint8Array()).all, '')
}

function updateRules() {
  console.log('\nImágenes y actualizaciones')
  eq('repo y tag', JSON.stringify(parseImageRef('vaultwarden/server:1.32')), '{"repo":"vaultwarden/server","tag":"1.32"}')
  eq('sin tag es latest', parseImageRef('nginx').tag, 'latest')
  eq('el puerto del registro no es la etiqueta', parseImageRef('localhost:5000/app').repo, 'localhost:5000/app')
  eq('registro con puerto y etiqueta', parseImageRef('localhost:5000/app:2').tag, '2')
  eq('fijada a digest', parseImageRef('valkey/valkey:8@sha256:81db').digest, 'sha256:81db')

  const c = inspect()
  eq('la etiqueta apunta a otra imagen: descargada sin aplicar', updateState(c, { Id: 'sha256:new', RepoDigests: [] }, 'sha256:x'), 'descargada')
  eq('mismo digest publicado: al día', updateState(c, { Id: 'sha256:old', RepoDigests: ['vaultwarden/server@sha256:aaa'] }, 'sha256:aaa'), 'al-dia')
  eq('digest publicado distinto: disponible', updateState(c, { Id: 'sha256:old', RepoDigests: ['vaultwarden/server@sha256:aaa'] }, 'sha256:bbb'), 'disponible')
  eq('sin respuesta del registro: desconocida', updateState(c, { Id: 'sha256:old', RepoDigests: [] }, null), 'desconocida')
  eq('fijada a un digest no se toca', updateState(inspect({ Config: { ...c.Config, Image: 'valkey/valkey:8@sha256:81db' } }), null, 'sha256:x'), 'fijada')
  eq('versión de la etiqueta OCI', imageVersion(IMAGE_CFG), '1.2.3')
  eq('versión por variable *_VERSION', imageVersion({ Env: ['PYTHON_VERSION=3.12', 'NGINX_VERSION=1.27.2'] }), '1.27.2')
}

function recreateRules() {
  console.log('\nRecrear para actualizar')
  const plan = recreatePlan(inspect(), IMAGE_CFG, 'vaultwarden/server:1.33')
  const b = plan.body as Record<string, any>
  eq('mismo nombre', plan.name, 'vaultwarden')
  eq('con la imagen nueva', b.Image, 'vaultwarden/server:1.33')
  check('ENTRYPOINT heredado de la imagen: fuera', !('Entrypoint' in b))
  check('CMD heredado: fuera', !('Cmd' in b))
  check('HEALTHCHECK heredado: fuera', !('Healthcheck' in b))
  check('WORKDIR heredado: fuera', !('WorkingDir' in b))
  eq('solo tus variables, no las de la imagen', b.Env.join('|'), 'ADMIN_TOKEN=secreto|DOMAIN=https://vault.casa')
  check('etiquetas de la imagen fuera', !('maintainer' in b.Labels) && !('org.opencontainers.image.version' in b.Labels))
  eq('tus etiquetas y las de compose se quedan', b.Labels['mi.etiqueta'], 'sí')
  eq('puerto expuesto por ti se queda, el de la imagen no', JSON.stringify(b.ExposedPorts), '{"3012/tcp":{}}')
  check('hostname automático (el ID viejo) fuera', !('Hostname' in b))
  eq('mismos puertos publicados', b.HostConfig.PortBindings['80/tcp'][0].HostPort, '8081')
  check('el volumen anónimo se vuelve a montar (o el nuevo estrenaría uno vacío)', b.HostConfig.Binds.includes('a1b2c3anon:/data'))
  check('y el bind que ya estaba no se duplica', b.HostConfig.Binds.filter((x: string) => x.includes(':/config')).length === 1)
  eq('primera red en la creación', Object.keys(b.NetworkingConfig.EndpointsConfig).join(), 'vaultwarden_default')
  check('sin el alias del ID viejo', !b.NetworkingConfig.EndpointsConfig.vaultwarden_default.Aliases.includes('f00dcafe1234'))
  eq('la segunda red se conecta después, con su IP fija', plan.extraNetworks[0].endpoint.IPAMConfig && (plan.extraNetworks[0].endpoint.IPAMConfig as any).IPv4Address, '172.30.0.10')

  const own = recreatePlan(inspect({ Config: { ...inspect().Config, Entrypoint: ['/mi.sh'], Cmd: ['serve'] } }), IMAGE_CFG, 'x:2')
  eq('ENTRYPOINT propio se queda', JSON.stringify((own.body as any).Entrypoint), '["/mi.sh"]')
  eq('y entonces el CMD también, aunque coincida', JSON.stringify((own.body as any).Cmd), '["serve"]')

  const host = recreatePlan(inspect({ HostConfig: { NetworkMode: 'host' } }), IMAGE_CFG, 'x:2')
  check('con red del sistema no se mandan endpoints', !('NetworkingConfig' in host.body) && host.extraNetworks.length === 0)
  const noImage = recreatePlan(inspect(), null, 'x:2')
  eq('sin la imagen vieja se conserva todo', (noImage.body as any).Env.length, 4)
}

function composeRules() {
  console.log('\ndocker-compose a partir del contenedor')
  const y = composeYaml(inspect(), IMAGE_CFG)
  check('servicio con su nombre de compose', y.includes('  vaultwarden:\n    image: vaultwarden/server:latest'))
  check('restart', y.includes('    restart: unless-stopped'))
  check('puerto en todas las interfaces sin IP', y.includes('      - "8081:80"'))
  check('puerto atado a una IP', y.includes('      - "127.0.0.1:3012:3012"'))
  check('bind de solo lectura', y.includes('      - "/home/luken/vw:/config:ro"'))
  check('volumen por su nombre', y.includes('      - "a1b2c3anon:/data"'))
  check('tus variables', y.includes('      - ADMIN_TOKEN=secreto') || y.includes('      - "ADMIN_TOKEN=secreto"'))
  check('sin las variables de la imagen', !y.includes('APP_VERSION'))
  check('sin las etiquetas internas de compose', !y.includes('com.docker.compose'))
  check('redes externas', y.includes('networks:\n  proxy:\n    external: true'))
  check('un valor con dos puntos va entre comillas', y.includes('"DOMAIN=https://vault.casa"'))
}

function portRules() {
  console.log('\nPuertos de la Pi')
  // Salida real de `netstat -tuln` (busybox) dentro del contenedor de la API.
  const out = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN
tcp        0      0 127.0.0.1:2375          0.0.0.0:*               LISTEN
tcp        0      0 100.64.0.10:8443      0.0.0.0:*               LISTEN
tcp        0      0 :::22                   :::*                    LISTEN
udp        0      0 0.0.0.0:53              0.0.0.0:*
tcp        0      0 fd7a:115c:a1e0::1c34:833d:2375 :::*             LISTEN`
  const used = parseNetstat(out)
  eq('puertos en escucha', used.map((u) => `${u.proto}/${u.port}`).join(), 'tcp/22,tcp/22,udp/53,tcp/2375,tcp/2375,tcp/8443')
  eq('dirección IPv6 entera', used.find((u) => u.address.startsWith('fd7a'))?.address, 'fd7a:115c:a1e0::1c34:833d')
  check('el 22 está ocupado', !isPortFree(22, used))
  check('el 53 está ocupado en udp', !isPortFree(53, used, 'udp'))
  check('el 53 tcp está libre', isPortFree(53, used, 'tcp'))
  check('el 8081 está libre', isPortFree(8081, used))
  let seed = 0
  const fixed = () => [0, 0.5][seed++ % 2]
  eq('aleatorio libre, saltándose uno ocupado', randomFreePort([{ proto: 'tcp', address: '', port: 10000 }], fixed), 35000)
}

function snapshotRules() {
  console.log('\nQué ha cambiado desde la última vez')
  const a = inspect({ Name: '/a' })
  const b = inspect({ Name: '/b' })
  const before = snapshotOf([a, b])
  const now = snapshotOf([
    inspect({ Name: '/a', State: { ...a.State, Running: false } }),
    inspect({ Name: '/b', RestartCount: 3 }),
    inspect({ Name: '/c' }),
  ])
  const ev = diffSnapshots(before, now).map((e) => `${e.name}:${e.kind}`).sort().join()
  eq('parado, reiniciado, nuevo', ev, 'a:parado,b:reiniciado,c:nuevo')
  eq('la primera vez no hay cambios que contar', diffSnapshots(null, now).length, 0)
  const updated = snapshotOf([inspect({ Name: '/a', Image: 'sha256:new', State: { ...a.State, StartedAt: 'otra' } })])
  eq('actualizado: imagen cambiada, no «reiniciado»', diffSnapshots(snapshotOf([a]), updated).map((e) => e.kind).join(), 'imagen')
  eq('eliminado', diffSnapshots(before, snapshotOf([a])).map((e) => `${e.name}:${e.kind}`).join(), 'b:eliminado')

  console.log('\nAvisos antes de tocar')
  check('la puerta de la API avisa', !!riskOf('ludok-docker-api')?.includes('deja de funcionar'))
  check('Nextcloud avisa', !!riskOf('nextcloud-app-1'))
  check('una base de datos avisa', !!riskOf('immich_postgres'))
  eq('uno cualquiera no', riskOf('duckdns'), null)
}

function cleanupRules() {
  console.log('\nQué imágenes se pueden borrar')
  eq('docker.io y library fuera', normalizeRef('docker.io/library/nginx'), 'nginx:latest')
  eq('sin etiqueta es latest', normalizeRef('vaultwarden/server'), 'vaultwarden/server:latest')
  eq('el digest no cuenta', normalizeRef('docker.io/valkey/valkey:8@sha256:81db'), 'valkey/valkey:8')
  // Como en la Pi: la etiqueta 34-apache ya apunta a la versión nueva, sin aplicar.
  const imgs = [
    { Id: 'sha256:n1', Containers: 1, Size: 1500, RepoTags: [], RepoDigests: ['nextcloud@sha256:a'] },
    { Id: 'sha256:n2', Containers: 0, Size: 1500, SharedSize: 500, RepoTags: ['nextcloud:34-apache'], RepoDigests: ['nextcloud@sha256:b'] },
    { Id: 'sha256:n3', Containers: 0, Size: 1476, RepoTags: [], RepoDigests: ['nextcloud@sha256:c'] },
    { Id: 'sha256:n4', Containers: 0, Size: 1456, RepoTags: ['nextcloud:33-apache'] },
    { Id: 'sha256:j1', Containers: 0, Size: 810, RepoTags: ['<none>:<none>'], RepoDigests: ['jellyfin/jellyfin@sha256:d'] },
    { Id: 'sha256:v1', Containers: 0, Size: 300, RepoTags: ['docker.io/valkey/valkey:7'] },
    { Id: 'sha256:h1', Containers: 0, Size: 5, RepoTags: ['hello-world:latest'] },
  ]
  const used = ['nextcloud:34-apache', 'valkey/valkey:8@sha256:81db', 'sha256:feed']
  const g = Object.fromEntries(classifyUnusedImages(imgs, used).map((c) => [c.id, c.group]))
  check('la que usa un contenedor no sale', !('sha256:n1' in g))
  eq('la nueva de tu etiqueta, descargada sin aplicar: pendiente', g['sha256:n2'], 'pendiente')
  eq('una versión vieja sin etiqueta de algo que usas: vieja', g['sha256:n3'], 'vieja')
  eq('otra etiqueta del mismo repo que usas: vieja', g['sha256:n4'], 'vieja')
  eq('de una app que ya no tienes: sin uso', g['sha256:j1'], 'sin-uso')
  eq('valkey:7 con docker.io delante es vieja de valkey', g['sha256:v1'], 'vieja')
  eq('hello-world: sin uso', g['sha256:h1'], 'sin-uso')
  const n2 = classifyUnusedImages(imgs, used).find((c) => c.id === 'sha256:n2')!
  eq('lo que se libera descuenta las capas compartidas', n2.reclaim, 1000)
  eq('nombre de una sin etiqueta', classifyUnusedImages(imgs, used).find((c) => c.id === 'sha256:j1')!.label, 'jellyfin/jellyfin (versión anterior)')
}

function hostRules() {
  console.log('\nEstado de la Pi y red de casa')
  // Salida real de los scripts en la Pi (el demux ya ha quitado las cabeceras).
  const stats = parseHostStats('temp=46850\nmemTotal=8256656\nmemAvail=5581952\ndiskTotal=1921724688\ndiskUsed=638111380\nuptime=6113648.72\nload=0.04 0.06 0.04\ncpus=4\n')
  eq('temperatura en grados', stats.tempC, 46.9)
  const r = Object.fromEntries(hostReadings(stats).map((x) => [x.label, x]))
  eq('RAM usada en %', r.RAM.percent, 32)
  eq('disco usado en %', r.Disco.percent, 33)
  eq('encendida', r.Encendida.value, '2 meses')
  eq('todo bien', hostReadings(stats).every((x) => x.level === 'bien'), true)
  const hot = hostReadings(parseHostStats('temp=81000\nmemTotal=100\nmemAvail=5\ndiskTotal=100\ndiskUsed=95\nload=9 9 9\ncpus=4'))
  eq('a 81 °C: mal', hot.find((x) => x.label === 'Temperatura')?.level, 'mal')
  eq('RAM al 95 %: aviso', hot.find((x) => x.label === 'RAM')?.level, 'aviso')
  eq('carga muy alta: mal', hot.find((x) => x.label === 'Carga')?.level, 'mal')
  check('sin sensor de temperatura no se inventa', parseHostStats('temp=\nmemTotal=1').tempC === null)

  const scan = parseNetworkScan(`dev=eth0
self=192.168.1.50/24
gw=192.168.1.1
IP address       HW type     Flags       HW address            Mask     Device
192.168.1.136    0x1         0x2         b2:11:22:44:55:66     *        eth0
172.18.0.2       0x1         0x2         f6:00:00:00:00:01     *        br-4446a97a7db8
192.168.1.20     0x1         0x0         00:00:00:00:00:00     *        eth0
192.168.1.1      0x1         0x2         00:1A:2B:3C:4D:5E     *        eth0
192.168.1.104    0x1         0x2         00:1d:0f:aa:bb:01     *        eth0
vendor 00:1a:2b:3c:4d:5e zte
vendor 00:1d:0f:aa:bb:01 Hon Hai Precision Ind.`)
  eq('la IP de la Pi, sin la máscara', scan.self, '192.168.1.50')
  eq('el router', scan.gateway, '192.168.1.1')
  eq('solo los que contestan, de la red de casa y ordenados', scan.devices.map((d) => d.ip).join(), '192.168.1.1,192.168.1.104,192.168.1.136')
  eq('MAC en minúsculas', scan.devices[0].mac, '00:1a:2b:3c:4d:5e')
  eq('fabricante', scan.devices[1].vendor, 'Hon Hai Precision Ind.')
  eq('sin fabricante en las MAC aleatorias', scan.devices[2].vendor, undefined)
  check('MAC aleatoria de móvil', isRandomMac('b2:11:22:44:55:66') && isRandomMac('2e:11:22:77:88:99'))
  check('MAC de fábrica', !isRandomMac('00:1a:2b:3c:4d:5e') && !isRandomMac('00:1d:0f:aa:bb:01'))

  // Lo que se vio en casa: el mismo aparato por el router y por el amplificador.
  const groups = groupDevices([
    { ip: '192.168.1.137', mac: '98:00:11:ab:cd:ef' },
    { ip: '192.168.1.132', mac: '2e:11:22:ab:cd:ef' },
    { ip: '192.168.1.1', mac: '00:1a:2b:3c:4d:5e', vendor: 'zte' },
    { ip: '192.168.1.104', mac: '00:1d:0f:aa:bb:01', vendor: 'Hon Hai' },
    { ip: '192.168.1.134', mac: '00:1d:0f:aa:bb:01', vendor: 'Hon Hai' },
  ])
  eq('router + amplificador: el mismo aparato una sola vez', groups.length, 3)
  const both = groups.find((g) => g.key === 'ab:cd:ef')!
  eq('con sus dos IPs', both.ips.sort().join(), '192.168.1.132,192.168.1.137')
  eq('y sus dos MAC', both.macs.length, 2)
  eq('misma MAC con dos IPs, una sola fila', groups.find((g) => g.key === 'aa:bb:01')!.ips.length, 2)
  eq('el nombre puesto por un camino vale por el otro', nameForGroup({ key: 'ab:cd:ef', macs: ['2e:11:22:ab:cd:ef'], ips: [] }, { '98:00:11:ab:cd:ef': 'Móvil de Laura' }), 'Móvil de Laura')
  eq('sin nombre, nada', nameForGroup(both, {}), undefined)
}

async function routeRules() {
  console.log('\nPor dónde se llega a la Pi')
  const TS = 'http://100.64.0.10:2375'
  const LAN = 'http://192.168.1.50:2375'
  /** Un fetch falso: `up` son las bases que responden; el resto no llega. */
  const fakeFetch = (up: string[], status = 200) => {
    const calls: string[] = []
    const f = async (url: string) => {
      calls.push(url)
      if (!up.some((b) => url.startsWith(b))) throw new Error('sin red')
      const body = url.endsWith('/_ping') ? 'OK' : JSON.stringify({ Version: '29', ApiVersion: '1.55', Os: 'linux', Arch: 'arm64' })
      return { ok: status < 400, status, text: async () => (status === 401 ? '{"message":"no"}' : body), arrayBuffer: async () => new ArrayBuffer(0) }
    }
    return { f, calls }
  }
  const cfg = { url: TS, lanUrl: LAN, user: 'ludok', password: 'x' }

  const both = fakeFetch([TS, LAN])
  const a = new DockerApi(cfg, both.f as never)
  await a.version()
  eq('con Tailscale, va por Tailscale', a.via, 'tailscale')
  check('y no prueba la de casa', !both.calls.some((u) => u.startsWith(LAN)))

  const home = fakeFetch([LAN])
  const b = new DockerApi(cfg, home.f as never)
  await b.version()
  eq('sin Tailscale en casa, va por la WiFi', b.via, 'casa')
  await b.version()
  eq('y no vuelve a probar Tailscale en cada petición', home.calls.filter((u) => u.startsWith(TS)).length, 1)

  const away = new DockerApi(cfg, fakeFetch([]).f as never)
  const err = await away.version().catch((e) => e)
  check('fuera de casa sin Tailscale, lo dice', err instanceof DockerError && /ni por Tailscale ni por la WiFi/.test(err.message), err?.message)

  const onlyTs = new DockerApi({ ...cfg, lanUrl: undefined }, fakeFetch([]).f as never)
  const err2 = await onlyTs.version().catch((e) => e)
  check('sin dirección de casa, pide activar Tailscale', /Tailscale activado/.test(err2?.message ?? ''), err2?.message)

  const wrong = new DockerApi(cfg, fakeFetch([TS, LAN], 401).f as never)
  const err3 = await wrong.version().catch((e) => e)
  check('contraseña mala: la ruta vale y el error es la contraseña', wrong.via === 'tailscale' && /contraseña/.test(err3?.message ?? ''), err3?.message)
}

async function main() {
  stateRules()
  streamRules()
  updateRules()
  recreateRules()
  composeRules()
  portRules()
  snapshotRules()
  cleanupRules()
  hostRules()
  await routeRules()
  finish('verify:docker')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
