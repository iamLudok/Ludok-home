import { StyleSheet, View } from 'react-native'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { radius, space } from '../ui/theme'
import type { ContainerState } from '../lib/docker/core'

/**
 * Estado de un contenedor: punto de color Y texto, nunca el color solo (se
 * tiene que entender al sol, con el móvil en gris o sin distinguir rojo y verde).
 */
export function StateBadge({ state }: { state: ContainerState }) {
  const palette = usePalette()
  const { color, label } =
    state.health === 'mal'
      ? { color: palette.missed, label: 'Mal' }
      : state.run === 'en-marcha'
        ? state.health === 'arrancando'
          ? { color: palette.pending, label: 'Arrancando' }
          : { color: palette.taken, label: state.health === 'sano' ? 'Sano' : 'En marcha' }
        : state.run === 'reiniciando'
          ? { color: palette.missed, label: 'Reiniciándose' }
          : state.run === 'pausado'
            ? { color: palette.pending, label: 'Pausado' }
            : state.run === 'muerto'
              ? { color: palette.missed, label: 'Muerto' }
              : { color: palette.faint, label: state.run === 'creado' ? 'Creado' : 'Parado' }
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Txt variant="data" tone="muted">
        {label}
        {state.since ? ` · ${state.since}` : ''}
      </Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
})
