import { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { radius, space } from '../ui/theme'
import { duration, shortDate } from '../lib/format'
import type { LocalNews } from '../lib/news'

/**
 * Reproductor de las noticias del día, con la lista de titulares para saltar
 * de una a otra. Suena con la pantalla apagada: es para escucharlo conduciendo.
 */
export function NewsPlayer({ news }: { news: LocalNews }) {
  const palette = usePalette()
  // `generado` en la clave de la fuente: con una URI igual (el fichero se
  // sobrescribe al descargar las de mañana) el reproductor no se enteraba de
  // que el audio había cambiado y seguía con el de ayer en memoria.
  const source = useMemo(() => ({ uri: `${news.audioUri}?v=${encodeURIComponent(news.index.generado)}` }), [news])
  const player = useAudioPlayer(source)
  const status = useAudioPlayerStatus(player)
  const items = news.index.noticias

  useEffect(() => {
    // En Android, sin controles en la pantalla de bloqueo el sistema corta el
    // audio en segundo plano a los pocos minutos.
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {})
  }, [])

  useEffect(() => {
    player.setActiveForLockScreen(status.playing, { title: 'Noticias de hoy', artist: 'Ludok Home' })
  }, [player, status.playing])

  const total = status.duration || news.index.duracion
  const current = items.reduce((acc, item, i) => (status.currentTime >= item.inicio ? i : acc), -1)

  const toggle = () => {
    if (status.playing) {
      player.pause()
      return
    }
    // Al terminar, volver a darle empieza desde el principio y no desde el final.
    if (total > 0 && status.currentTime >= total - 0.5) player.seekTo(0)
    player.play()
  }

  const jump = (seconds: number) => {
    player.seekTo(Math.max(0, seconds))
    if (!status.playing) player.play()
  }

  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0

  return (
    <View style={styles.wrap}>
      <View style={styles.controls}>
        <Pressable
          onPress={toggle}
          disabled={!status.isLoaded}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pausar' : 'Reproducir'}
          style={({ pressed }) => [
            styles.play,
            { backgroundColor: palette.fg, opacity: !status.isLoaded ? 0.4 : pressed ? 0.6 : 1 },
          ]}
        >
          {status.playing ? (
            <View style={styles.pauseIcon}>
              <View style={[styles.pauseBar, { backgroundColor: palette.onFg }]} />
              <View style={[styles.pauseBar, { backgroundColor: palette.onFg }]} />
            </View>
          ) : (
            <View style={[styles.playIcon, { borderLeftColor: palette.onFg }]} />
          )}
        </Pressable>
        <View style={styles.meta}>
          <Txt variant="section">
            {items.length} noticias de {shortDate(news.index.fecha)}
          </Txt>
          <Txt variant="data" tone="muted">
            {duration(status.currentTime)} / {duration(total)}
          </Txt>
        </View>
        <Pressable
          onPress={() => jump((items[current + 1] ?? { inicio: total }).inicio)}
          disabled={current + 1 >= items.length}
          accessibilityRole="button"
          accessibilityLabel="Siguiente noticia"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: current + 1 >= items.length ? 0.3 : pressed ? 0.6 : 1 })}
        >
          <Txt variant="small" style={{ fontWeight: '600' }}>
            Siguiente
          </Txt>
        </Pressable>
      </View>

      <View style={[styles.track, { backgroundColor: palette.surface2 }]}>
        <View style={[styles.bar, { backgroundColor: palette.fg, width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.list}>
        {items.map((item, i) => (
          <Pressable
            key={`${i}-${item.inicio}`}
            onPress={() => jump(item.inicio)}
            accessibilityRole="button"
            accessibilityLabel={`Escuchar: ${item.titulo}`}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Txt variant="data" tone={i === current ? 'fg' : 'faint'} style={styles.itemTime}>
              {duration(item.inicio)}
            </Txt>
            <View style={styles.itemText}>
              <Txt variant="small" tone={i === current ? 'fg' : 'muted'} numberOfLines={2} style={i === current ? { fontWeight: '700' } : undefined}>
                {item.titulo}
              </Txt>
              <Txt variant="data" tone="faint" numberOfLines={1}>
                {item.feed}
              </Txt>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const PLAY = 44

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  play: { width: PLAY, height: PLAY, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  // Triángulo con bordes: sin librería de iconos.
  playIcon: {
    width: 0,
    height: 0,
    marginLeft: 4,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 13,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  pauseIcon: { flexDirection: 'row', gap: 4 },
  pauseBar: { width: 4, height: 15, borderRadius: 1 },
  meta: { flex: 1, gap: 2 },
  track: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: '100%' },
  list: { gap: space.sm },
  item: { flexDirection: 'row', gap: space.md },
  itemTime: { width: 36, paddingTop: 1 },
  itemText: { flex: 1, gap: 1 },
})
