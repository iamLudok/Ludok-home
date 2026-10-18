# Ludok Home (app)

App Android para gestionar lo de casa que antes hacía con el bot de Telegram: **lo que tengo que
hacer hoy, los gastos del coche, las medicinas, mis listas y lo que guardo para luego**. Nació para salir de Telegram, que era
un tercero por el que pasaba todo, y para dejar de escribir comandos como `/gasolina 40 1.65`.

Vive en la carpeta `app/` del repo Ludok-home; la otra mitad es la Raspberry Pi (la raíz del repo),
que cada mañana genera el audio de noticias. React Native con Expo SDK 57.

## Lo que manda: no perder datos nunca

Todo lo demás va después.

- Los datos viven en el móvil (`/data/data/com.ludok.home/`), en SQLite. Sin cuentas ni nube ajena.
- Copia de seguridad en JSON, exportable e importable en cualquier momento.
- **Copia automática a mi Nextcloud** al abrir la app y al salir de ella, un fichero por día. No
  exige WiFi: con Tailscale el servidor está igual de a mano con datos móviles. Si no llega, lo
  local sigue siendo la copia buena y se reintenta la próxima vez.
- Aviso en Hoy cuando llevas mucho sin copia.
- La capa de datos **se prueba de verdad**, no solo con tipos (ver más abajo).

## Qué hay en cada pestaña

| Pestaña | Qué hace | De dónde salen los datos |
|---|---|---|
| Hoy | El tiempo, notas rápidas, medicinas que faltan por tomar, tareas que vencen hoy o están atrasadas, eventos de hoy y el audio de noticias. El engranaje abre Ajustes | Tiempo: Open-Meteo. Notas y medicinas: el móvil. Tareas y eventos: Nextcloud por CalDAV (los tableros de Deck incluidos). Noticias: la Pi |
| Coche | Repostajes, taller y recambios. Gráfico de 6 meses que se actualiza al apuntar, consumo y precio medio | El móvil |
| Medicinas | Pauta, avisos y registro de adherencia en dos semanas o en mes | El móvil |
| Listas | Compra (compartir por WhatsApp, vaciar), wishlist y regalos con imagen, y regalos agrupados por persona | El móvil |
| Guardados | Reels, apps, portfolios y webs para luego, con etiquetas | El móvil |
| Servidor (icono en Hoy) | Los Docker de la Pi: estado, arrancar/parar/reiniciar/eliminar, logs, comandos, compose, actualizar y cambiar de versión, puertos, limpieza y test de velocidad. Arriba, cómo está la Pi y quién hay en la red de casa | La API de Docker de la Pi, por Tailscale o por la WiFi de casa |

### Servidor: los Docker de la Pi

Sustituye al bot `docker-controller-bot` de Telegram, todo **bajo demanda**: lo que el bot avisaba
solo (caídas, actualizaciones) aquí se ve al abrir la pantalla, en «Desde la última vez». No hay
avisos push, ni auto-actualizaciones, ni tareas programadas.

- La app habla con la API de Docker a través de un Caddy con usuario y contraseña
  (`deploy/docker-api` en la raíz del repo), publicado en Tailscale con `tailscale serve` y también
  en la IP fija de casa de la Pi. La app prueba primero Tailscale y, si no responde en 2,5 s, la WiFi
  de casa. **Fuera de casa hace falta Tailscale**: no se abre a internet a propósito.
- Por la WiFi de casa va sin cifrar (`http://`): alguien en tu misma red podría ver la contraseña.
  Por Tailscale va cifrado.
- Esa contraseña da control total de Docker, que es casi ser root en la Pi: no viaja en las copias.
- **Actualizar** hace lo mismo que el bot: descarga, para y renombra el viejo a `…_old`, crea el
  nuevo con la misma configuración (quitando lo heredado de la imagen vieja y volviendo a montar los
  volúmenes anónimos), comprueba que aguanta en pie y solo entonces borra el viejo. Si algo falla, el
  viejo vuelve tal cual.
- «¿Hay versión nueva?» se lo pregunta el propio Docker al registro, y distingue entre «hay una
  nueva publicada» y «ya está descargada pero sin aplicar».
- Los puertos que se ven son **todos** los de la Pi, no solo los de los contenedores: el Caddy va con
  la red del sistema y la app ejecuta `netstat` dentro de él.
- No se deja parar, eliminar ni actualizar `ludok-docker-api` desde la app: es la propia puerta.
- **La Pi y la red de casa** (lo que eran `/pi` y `/red` del bot): arriba en Servidor salen la
  temperatura, la RAM, el disco, la carga y cuánto lleva encendida, y «Red de casa» lista quién está
  conectado (un ping a cada IP del /24 y la tabla de vecinos; tarda un segundo). Nada se queda
  ejecutándose en la Pi: se lee solo al abrir la pantalla, dentro del mismo contenedor de la API, que
  ve /proc y /sys de la Pi. A cada dispositivo se le puede poner nombre, y los nombres van en la copia. Sale el fabricante (base de `nmap`), el móvil desde el que miras se marca solo, y un aparato que se ve por el router y por el amplificador (que reescribe la primera mitad de la MAC y conserva la segunda) se junta en una sola fila.
- **Limpieza de imágenes** no usa `docker image prune -a`, que se llevaría también las
  actualizaciones descargadas sin aplicar. Las reparte en tres grupos y enseña cuáles hay en cada uno:
  versiones viejas de lo que usas (se borran), de apps que ya no tienes en marcha (se borran, sus
  datos se quedan en sus carpetas) y actualizaciones pendientes (no se tocan).
- **Velocidad**: lo que hace «test de velocidad» en Google, sin Google, y además si la operadora
  da lo contratado. Con un solo botón, uno detrás de otro (a la vez se repartirían la fibra):
  - **La línea, por cable**: la mide la Pi, que va al router por cable, que es lo que la operadora
    se compromete a dar (por WiFi casi siempre llega menos, y no se sabría de quién es la culpa).
    Se ejecuta dentro del contenedor de la API de Docker, que ya trae `curl` y `ping`, sin instalar
    nada: 6 conexiones a la vez (con una sola, una fibra rápida no se llena) y cuenta los bytes de
    la tarjeta de red de la Pi entre el segundo 2 y el 10, sin las cabeceras de red. Tarda unos 25 s.
  - **Este móvil**, lo que le llega a él ahora: ping, bajada y subida con la cifra en directo, una
    conexión y peticiones cada vez más grandes, unos 8 s por sentido. Con datos móviles avisa antes,
    porque con 5G puede gastar cientos de megas.
  - Las dos contra el servidor de Cloudflare más cercano. Para medir internet hace falta un servidor
    fuera de casa y no hay forma de evitar a un tercero (el de Google usa M-Lab, que publica cada
    test con la IP; Cloudflare no). Sin cuenta ni clave: solo ve la IP y bytes de relleno.
  - La latencia es la mínima, como la de Google, para que las cifras se puedan comparar.
  - Con la velocidad contratada (se pone en la misma pantalla y va en la copia) dice si la línea
    cumple, y comparando línea y móvil, si lo que se queda corto es la WiFi. Se guarda el último
    resultado, no un historial.

`verify/docker-real.ts` prueba todo esto contra un Docker de verdad con un contenedor de usar y
tirar (incluido que los datos sobreviven a una actualización y que un fallo deja el viejo como
estaba). No va en `npm run verify` porque necesita la Pi:

```bash
LUDOK_DOCKER_URL=http://100.x.x.x:2375 LUDOK_DOCKER_PASSWORD=… npm run verify:docker-real
# con LUDOK_DOCKER_LAN_URL=http://192.168.1.x:2375 prueba también la entrada por casa
```

`verify/speed-real.ts` hace el test de velocidad de verdad con el mismo código que la app: la línea
desde la Pi (si se le da la contraseña) y luego el del equipo contra Cloudflare. Gasta unos cientos
de megas en el equipo y más de un giga en la fibra:

```bash
LUDOK_DOCKER_URL=http://100.x.x.x:2375 LUDOK_DOCKER_PASSWORD=… npm run verify:speed-real
```

### El tiempo en Hoy

- Sale de **Open-Meteo**, la fuente por defecto de Breezy Weather (así se ve lo mismo que allí): mezcla
  los modelos de AEMET, Météo-France y DWD y no pide cuenta ni clave. Breezy no se puede meter dentro
  de la app (es una app entera, no una librería), pero sus datos sí.
- Ahora, sensación, máxima y mínima, si va a llover y cuándo («Lluvia probable hacia las 17:00»), las
  próximas 12 horas y una línea para mañana. Un icono de lluvia con menos de un 30 % de probabilidad no
  cuenta como lluvia: Open-Meteo da «llovizna» con un 0 % a menudo.
- **Dónde**: la ubicación **aproximada** del móvil (al kilómetro; el permiso de ubicación precisa está
  bloqueado en `app.json`) o una ciudad fija, buscada con el buscador de Open-Meteo. El permiso solo se
  pide al pulsar «Usar mi ubicación», nunca solo. La ciudad fija va en la copia.
- El nombre del sitio solo sale con ciudad fija: sacarlo de la ubicación lo haría el geocodificador de
  Android, que por detrás pregunta a Google.
- Se pide al abrir la app y al volver a ella, solo si la guardada tiene más de media hora o te has
  movido más de 5 km. Sin conexión se ve la última, sin las horas que ya han pasado.
- Los iconos son formas (círculos y barras), como los de las pestañas: sin librería ni emojis.

### Compartir a la app

Desde Instagram, el navegador o la app de Amazon: **Compartir → Ludok Home**. Sale «¿Dónde lo
guardo?» con el destino ya sugerido (un reel, a Guardados; Amazon, a la wishlist) y después el
formulario relleno. Un texto sin enlace se apunta como nota para hoy.

### Imágenes de la wishlist y los regalos

La imagen se saca sola del enlace (la vista previa que declara la web, la misma que enseña WhatsApp).
Amazon le pone un captcha a todo lo que no sea un navegador, así que ahí la foto sale del código del
producto (ASIN) que va en el enlace. Si no sale nada, o prefieres otra, se elige una foto de la
galería: se guarda reducida a 800 px y viaja dentro de la copia de seguridad.

### Notas rápidas

Arriba del todo en Hoy. «Para hoy» o «en mente». Una nota para hoy que no se hace no desaparece a
medianoche: sigue saliendo, marcada como pendiente desde ese día.

### Medicinas

Una medicina de cada N días toca cuando han pasado al menos N días desde la última toma, y
**sigue tocando hasta que la tomes**. El bot lo hacía con «días desde la última toma múltiplo de N»:
si te olvidabas las gotas el día que tocaban, al día siguiente ya no tocaban.

Si cambias de tratamiento, en la ficha de la medicina está **«Empezar de cero desde hoy»**: borra
su historial y la cuenta desde hoy.

Los avisos son notificaciones **locales** programadas en el móvil para los próximos 14 días:
llegan con la app cerrada y sin conexión. Se reprograman al abrir la app y al marcar una toma
(marcarla cancela los repasos de ese día). Una medicina que dejas de tomar se desactiva, no se
borra: su historial se queda en el gráfico.

### Noticias

La Pi las genera a las 5:45 con Piper (voz local) y deja `noticias.ogg` y `noticias.json` (el
segundo en que empieza cada noticia) en la carpeta «Ludok Home» de Nextcloud. La app las descarga
al móvil en cuanto puede, para escucharlas en el coche sin cobertura, y deja saltar de una noticia
a otra.

Cada mañana a las 6:15, antes de salir de casa, llega un aviso de que están listas. Tocarlo abre la app, que las descarga al móvil para escucharlas sin cobertura (se cambia la hora o se apaga en Ajustes).
Va en su propio canal de notificaciones, «Noticias de la mañana», para poder silenciarlo en Android
sin tocar el de las medicinas.

### Importar los datos del bot

Una sola vez, desde Ajustes: lee las notas del bot en Nextcloud Notes (gastos del coche, medicinas
con su historial, compra, wishlist y regalos) y las pasa a la base del móvil. Las notas no se tocan.
Las medicinas que solo salen en el historial (Relvar, Rolufta) entran desactivadas. Una línea que
no se entiende no aborta nada: se salta y se enseña al terminar.

## Arranque

```bash
npm install
npm run android      # instala y abre en un móvil conectado por adb
npm run typecheck    # tipos de la app y de los scripts de verificación
npm run verify       # comprueba la capa de datos
```

Hace falta JDK 17, Android SDK con API 36 y `adb`.

> Gradle pide un toolchain de **Java 17**. Si falla con «Cannot find a Java installation matching
> languageVersion=17» teniendo un JDK más nuevo, apunta al que Gradle ya se descargó:
>
> ```bash
> export JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2
> ```

## Compilar un APK

```bash
npm run build:apk                    # todas las arquitecturas
./scripts/build-apk.sh --compartir   # solo arm64-v8a, para mi móvil
# → ludok-home-v<versión>.apk (nombre y versión salen de app.json)
```

Hasta que la app se publique, la versión se queda en **1.0.0** y lo que sube con cada APK es
`android.versionCode` en `app.json`: Android no deja instalar encima un APK con un `versionCode`
menor que el instalado (habría que desinstalar, y eso borra los datos).

```bash
adb install -r ludok-home-v1.0.0.apk
```

Tiene que ser **release**, no debug: en debug el JavaScript no va dentro del APK, se carga del
servidor de Metro, así que un APK de debug no funciona sin el ordenador delante.

## ⚠️ El keystore se guarda como oro

`release.jks` y `keystore.properties` están fuera del repo (en `.gitignore`). Android solo deja
instalar encima si el APK va firmado con la misma clave; si se pierden, la única salida es
desinstalar, y **desinstalar borra los datos de la app**. Se guardan junto a las copias de
seguridad: es lo único de este proyecto que no se puede regenerar.

## Verificación de la capa de datos

Scripts de Node que ejecutan **el mismo código que corre en el móvil** contra un SQLite de
escritorio (`@libsql/client`). La lógica pide la base a `src/lib/dbRef.ts` en vez de importar
`expo-sqlite`, y eso es lo que permite correrla en el portátil.

| Script | Qué comprueba |
|---|---|
| `verify/data.ts` | Ida y vuelta de la copia: nada se pierde, sin `null`, sin la contraseña, lo que se rechaza |
| `verify/library.ts` | Las reglas: fechas con cambio de hora, dinero en céntimos, coche, cuándo toca cada medicina, avisos, adherencia, listas |
| `verify/migration.ts` | Que actualizar desde la v1 con datos deja el mismo esquema que una instalación nueva |
| `verify/import.ts` | La importación de las notas del bot, con sus casos raros. Con un JSON de notas reales como argumento, lo prueba también |
| `verify/caldav.ts` | Leer tareas y eventos de las respuestas de Nextcloud: Deck, alarmas, líneas partidas, días completos |
| `verify/weather.ts` | El tiempo sin red: leer la previsión de Open-Meteo, textos e iconos, horas que quedan, aviso de lluvia (incluido el caso real de «llovizna» al 0 %), buscador de ciudades y cuándo volver a pedirla |
| `verify/links.ts` | Vista previa de enlaces: HTML raro, Amazon por ASIN, lo que comparte Instagram, quitar el rastreo |
| `verify/docker.ts` | Docker sin red: estado, flujo binario de logs/exec, actualizaciones, recrear sin perder nada, compose, puertos, qué imágenes se pueden borrar, estado de la Pi, red de casa (amplificador incluido) y por dónde se llega a la Pi |
| `verify/docker-real.ts` | Lo mismo contra la Pi de verdad, con un contenedor de usar y tirar. No va en `npm run verify` (ver «Servidor») |
| `verify/speed.ts` | Test de velocidad sin red: tamaño de cada petición, velocidad, ping y jitter, el test entero contra una línea falsa de velocidad conocida, errores y límites del servidor, leer lo que mide la Pi y las conclusiones (si la línea cumple, si es la WiFi) |
| `verify/speed-real.ts` | El test de verdad: la línea desde la Pi y el equipo contra Cloudflare. No va en `npm run verify` |

## Estructura

```
app/                 pantallas (expo-router): _layout, (tabs)/, ajustes y servidor/
src/types.ts         modelo de dominio y forma del fichero de copia
src/lib/             datos y reglas, sin nada nativo salvo db.ts, backup.ts, news.ts, notifications.ts y photos.ts
src/lib/docker/      cliente de la API de Docker (api.ts) y sus reglas puras (core.ts); client.ts pone el fetch de Expo
src/hooks/           consultas reactivas y la sincronización al abrir la app
src/components/      gráficos, formularios, reproductor
src/ui/              tema y primitivas (Txt, Button, Card, Field, Sheet…)
verify/              pruebas de la capa de datos
scripts/build-apk.sh compilar y firmar
```

## Diseño

«Sala oscura», como Ludok Time, Ludok Been y Ludrest: interfaz monocroma, sin color de acento,
iconos geométricos sin emojis. Aquí no hay carátulas que pongan color, así que el único color es el
de los datos y siempre con significado: las tres categorías del coche (validadas para daltonismo y
siempre con leyenda y tabla) y los estados de las medicinas (siempre con su símbolo: ✓ tomada,
× olvidada, ! pendiente).
