import { StyleSheet, View } from 'react-native'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { radius, space } from '../ui/theme'
import type { HostReading } from '../lib/docker/core'

/**
 * Cómo está la Pi (lo que era /pi). El nivel va en color Y en texto: «aviso» o
 * «mal» se escriben al lado, no se fían solo del rojo.
 */
export function PiStats({ readings }: { readings: HostReading[] }) {
  const palette = usePalette()
  const color = { bien: palette.taken, aviso: palette.pending, mal: palette.missed }
  return (
    <View style={styles.wrap}>
      {readings.map((r) => (
        <View key={r.label} style={styles.item}>
          <View style={styles.head}>
            <Txt variant="small" tone="muted" style={styles.label}>
              {r.label}
            </Txt>
            <Txt variant="data">
              {r.value}
              {r.level !== 'bien' ? ` · ${r.level === 'mal' ? 'mal' : 'ojo'}` : ''}
            </Txt>
          </View>
          {r.percent !== undefined ? (
            <View style={[styles.track, { backgroundColor: palette.surface2 }]}>
              <View style={[styles.bar, { width: `${r.percent}%`, backgroundColor: color[r.level] }]} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  item: { gap: space.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  label: { flex: 1 },
  track: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: '100%' },
})
