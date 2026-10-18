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
| Hoy | Notas rápidas, medicinas que faltan por tomar, tareas que vencen hoy o están atrasadas, eventos de hoy y el audio de noticias. El engranaje abre Ajustes | Notas y medicinas: el móvil. Tareas y eventos: Nextcloud por CalDAV (los tableros de Deck incluidos). Noticias: la Pi |
| Coche | Repostajes, taller y recambios. Gráfico de 6 meses que se actualiza al apuntar, consumo y precio medio | El móvil |
| Medicinas | Pauta, avisos y registro de adherencia en dos semanas o en mes | El móvil |
| Listas | Compra (compartir por WhatsApp, vaciar), wishlist y regalos con imagen, y regalos agrupados por persona | El móvil |
| Guardados | Reels, apps, portfolios y webs para luego, con etiquetas | El móvil |

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

La Pi las genera a las 7:30 con Piper (voz local) y deja `noticias.ogg` y `noticias.json` (el
segundo en que empieza cada noticia) en la carpeta «Ludok Home» de Nextcloud. La app las descarga
al móvil en cuanto puede, para escucharlas en el coche sin cobertura, y deja saltar de una noticia
a otra.

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
adb install -r ludok-home-v1.1.0.apk
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
| `verify/links.ts` | Vista previa de enlaces: HTML raro, Amazon por ASIN, lo que comparte Instagram, quitar el rastreo |

## Estructura

```
app/                 pantallas (expo-router): _layout y (tabs)/
src/types.ts         modelo de dominio y forma del fichero de copia
src/lib/             datos y reglas, sin nada nativo salvo db.ts, backup.ts, news.ts, notifications.ts y photos.ts
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
