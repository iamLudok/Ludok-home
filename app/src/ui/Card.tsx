import { View, StyleSheet, type ViewStyle } from 'react-native'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { radius, space } from './theme'

/** Superficie elevada con borde fino. Todas las secciones de la app van en una. */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const palette = usePalette()
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }, style]}>
      {children}
    </View>
  )
}

/** Título de sección en versalitas, con algo opcional a la derecha (un botón, un dato). */
export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="label" tone="muted">
        {title}
      </Txt>
      {right}
    </View>
  )
}

/** Fila de la tabla: etiqueta a la izquierda, valor a la derecha. */
export function DataRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt variant="small" tone="muted" style={styles.rowLabel}>
        {label}
      </Txt>
      <Txt variant="data" style={strong ? { fontWeight: '700' } : undefined}>
        {value}
      </Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  rowLabel: { flex: 1 },
})
