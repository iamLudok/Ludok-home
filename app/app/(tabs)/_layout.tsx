import { Tabs } from 'expo-router'
import { View, StyleSheet, type ColorValue } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '../../src/ui/ThemeProvider'
import { radius } from '../../src/ui/theme'

/**
 * Las cinco pestañas. Los iconos son formas geométricas dibujadas con vistas
 * en vez de emojis: la interfaz es monocroma, y un emoji a color rompería justo
 * eso (y cada fabricante de Android los dibuja distintos).
 */
type Shape = 'hoy' | 'coche' | 'medicinas' | 'listas' | 'guardados'

function Icon({ shape, color }: { shape: Shape; color: ColorValue }) {
  if (shape === 'hoy') {
    // Un sol: punto dentro de un anillo.
    return (
      <View style={styles.box}>
        <View style={[styles.ring, { borderColor: color, borderWidth: 2 }]} />
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
    )
  }
  if (shape === 'coche') {
    // Carrocería y dos ruedas.
    return (
      <View style={styles.box}>
        <View style={[styles.carBody, { backgroundColor: color }]} />
        <View style={styles.wheels}>
          <View style={[styles.wheel, { backgroundColor: color }]} />
          <View style={[styles.wheel, { backgroundColor: color }]} />
        </View>
      </View>
    )
  }
  if (shape === 'medicinas') {
    // Una cápsula: mitad rellena, mitad contorno.
    return (
      <View style={styles.box}>
        <View style={[styles.pill, { borderColor: color }]}>
          <View style={[styles.pillHalf, { backgroundColor: color }]} />
        </View>
      </View>
    )
  }
  if (shape === 'listas') {
    return (
      <View style={[styles.box, styles.lines]}>
        <View style={[styles.line, { backgroundColor: color, width: 16 }]} />
        <View style={[styles.line, { backgroundColor: color, width: 16 }]} />
        <View style={[styles.line, { backgroundColor: color, width: 10 }]} />
      </View>
    )
  }
  // Un marcador de libro: rectángulo con un pico recortado abajo.
  return (
    <View style={styles.box}>
      <View style={[styles.mark, { borderColor: color }]} />
      <View style={[styles.notch, { borderBottomColor: color }]} />
    </View>
  )
}

export default function TabsLayout() {
  const palette = usePalette()
  // La barra de gestos del sistema se come el texto de las pestañas si no se
  // deja hueco por debajo (se ve en un Pixel con navegación por gestos).
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.bg },
        tabBarActiveTintColor: palette.fg,
        tabBarInactiveTintColor: palette.faint,
        tabBarStyle: {
          backgroundColor: palette.bg,
          borderTopColor: palette.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: ({ color }) => <Icon shape="hoy" color={color} /> }} />
      <Tabs.Screen name="coche" options={{ title: 'Coche', tabBarIcon: ({ color }) => <Icon shape="coche" color={color} /> }} />
      <Tabs.Screen
        name="medicinas"
        options={{ title: 'Medicinas', tabBarIcon: ({ color }) => <Icon shape="medicinas" color={color} /> }}
      />
      <Tabs.Screen name="listas" options={{ title: 'Listas', tabBarIcon: ({ color }) => <Icon shape="listas" color={color} /> }} />
      <Tabs.Screen
        name="guardados"
        options={{ title: 'Guardados', tabBarIcon: ({ color }) => <Icon shape="guardados" color={color} /> }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  box: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 17, height: 17, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  carBody: { width: 18, height: 8, borderRadius: 3, marginTop: -2 },
  wheels: { position: 'absolute', bottom: 2, flexDirection: 'row', gap: 6 },
  wheel: { width: 5, height: 5, borderRadius: radius.pill },
  pill: {
    width: 18,
    height: 9,
    borderRadius: radius.pill,
    borderWidth: 2,
    overflow: 'hidden',
    transform: [{ rotate: '-35deg' }],
  },
  pillHalf: { width: '50%', height: '100%' },
  lines: { gap: 3, alignItems: 'flex-start', paddingLeft: 2 },
  line: { height: 2.5, borderRadius: 1.25 },
  mark: { width: 13, height: 17, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  // Triángulo con bordes: el pico del marcador, del color del trazo.
  notch: {
    position: 'absolute',
    bottom: 1.5,
    width: 0,
    height: 0,
    borderLeftWidth: 6.5,
    borderRightWidth: 6.5,
    borderBottomWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
})
