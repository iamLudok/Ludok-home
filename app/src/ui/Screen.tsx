import { View, StyleSheet, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { space } from './theme'

/**
 * Contenedor de pantalla. Respeta la zona segura de arriba (barra de estado) y
 * deja el borde inferior a la barra de pestañas, que ya la gestiona el layout.
 */
export function Screen({
  children,
  title,
  right,
  padded = true,
  style,
}: {
  children: React.ReactNode
  title?: string
  right?: React.ReactNode
  padded?: boolean
  style?: ViewStyle
}) {
  const palette = usePalette()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { backgroundColor: palette.bg, paddingTop: insets.top }, style]}>
      {title !== undefined && (
        <View style={styles.head}>
          <Txt variant="display" style={styles.headTitle} numberOfLines={1}>
            {title}
          </Txt>
          {right}
        </View>
      )}
      <View style={[styles.body, padded && styles.padded]}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headTitle: { flexShrink: 1 },
  body: { flex: 1 },
  padded: { paddingHorizontal: space.lg },
})

/** Estado vacío: un texto y, si hace falta, una acción. */
export function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <View style={styles2.empty}>
      <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>
        {text}
      </Txt>
      {children}
    </View>
  )
}

const styles2 = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xl,
  },
})
