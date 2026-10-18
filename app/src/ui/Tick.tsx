import { Pressable, StyleSheet, View } from 'react-native'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { radius } from './theme'

interface Props {
  on: boolean
  onPress: () => void
  size?: number
  label?: string
}

/**
 * La casilla de «hecho»: medicina tomada, artículo comprado. Es lo que más se
 * pulsa en toda la app, así que tiene área de toque holgada (`hitSlop`) aunque
 * el círculo se vea pequeño.
 */
export function Tick({ on, onPress, size = 26, label }: Props) {
  const palette = usePalette()
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label ?? (on ? 'Desmarcar' : 'Marcar como hecho')}
      style={({ pressed }) => [{ opacity: pressed ? 0.55 : 1 }]}
    >
      <View
        style={[
          styles.base,
          {
            width: size,
            height: size,
            borderRadius: radius.pill,
            borderColor: on ? palette.on : palette.line,
            backgroundColor: on ? palette.on : 'transparent',
          },
        ]}
      >
        <Txt
          variant="small"
          style={{ color: on ? palette.onFg : palette.faint, fontSize: size * 0.5, lineHeight: size * 0.62 }}
        >
          ✓
        </Txt>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
})
