import { StyleSheet, View, type ViewStyle } from 'react-native'
import { usePalette } from '../ui/ThemeProvider'
import type { WeatherIcon as Kind } from '../lib/weather/core'

/**
 * Iconos del tiempo hechos con círculos y barras, como los de la barra de
 * pestañas: sin librería de iconos ni emojis. Monocromos, como toda la
 * interfaz: el sol es del color del texto y las nubes un paso más apagadas, y
 * con eso se distinguen sin inventar colores.
 *
 * Todo se mide en fracciones de `size`, así el mismo dibujo vale en grande
 * (ahora) y en pequeño (las horas).
 */
export function WeatherIcon({ kind, isDay = true, size }: { kind: Kind; isDay?: boolean; size: number }) {
  const s = size
  const sunny = kind === 'despejado'
  const partly = kind === 'pocas-nubes'
  const below = kind === 'lluvia' || kind === 'llovizna' || kind === 'nieve' || kind === 'tormenta'
  return (
    <View style={{ width: s, height: s }} accessible={false}>
      {sunny ? <Orb isDay={isDay} size={s * 0.62} style={{ left: s * 0.19, top: s * 0.19 }} /> : null}
      {partly ? <Orb isDay={isDay} size={s * 0.46} style={{ left: s * 0.06, top: s * 0.06 }} /> : null}
      {partly ? <Cloud width={s * 0.7} style={{ left: s * 0.26, top: s * 0.42 }} /> : null}
      {kind === 'nubes' ? <Cloud width={s * 0.9} style={{ left: s * 0.05, top: s * 0.24 }} /> : null}
      {below ? <Cloud width={s * 0.86} style={{ left: s * 0.07, top: s * 0.06 }} /> : null}
      {below ? <Under kind={kind} size={s} /> : null}
      {kind === 'niebla' ? <Fog size={s} /> : null}
    </View>
  )
}

/** Sol con rayos o, de noche, luna en cuarto creciente. */
function Orb({ isDay, size, style }: { isDay: boolean; size: number; style: ViewStyle }) {
  const palette = usePalette()
  if (!isDay) {
    // La luna es un círculo tapado por otro del color de la tarjeta.
    const d = size * 0.78
    return (
      <View style={[styles.abs, style, { width: size, height: size }]}>
        <View style={[styles.abs, { left: size * 0.11, top: size * 0.11, width: d, height: d, borderRadius: d, backgroundColor: palette.fg }]} />
        <View style={[styles.abs, { left: size * 0.36, top: 0, width: d, height: d, borderRadius: d, backgroundColor: palette.surface }]} />
      </View>
    )
  }
  const core = size * 0.52
  const ray = { w: Math.max(1.5, size * 0.09), h: size * 0.17 }
  return (
    <View style={[styles.abs, styles.center, style, { width: size, height: size }]}>
      <View style={{ width: core, height: core, borderRadius: core, backgroundColor: palette.fg }} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <View
          key={a}
          style={[
            styles.abs,
            {
              width: ray.w,
              height: ray.h,
              borderRadius: ray.w,
              backgroundColor: palette.fg,
              transform: [{ rotate: `${a}deg` }, { translateY: -size * 0.42 }],
            },
          ]}
        />
      ))}
    </View>
  )
}

/** Nube: una base redondeada y dos bultos encima. `width` manda; la altura sale de ella. */
function Cloud({ width, style }: { width: number; style: ViewStyle }) {
  const palette = usePalette()
  const w = width
  const fill = { backgroundColor: palette.muted }
  return (
    <View style={[styles.abs, style, { width: w, height: w * 0.62 }]}>
      <View style={[styles.abs, fill, { left: w * 0.14, top: w * 0.14, width: w * 0.38, height: w * 0.38, borderRadius: w }]} />
      <View style={[styles.abs, fill, { left: w * 0.36, top: 0, width: w * 0.5, height: w * 0.5, borderRadius: w }]} />
      <View style={[styles.abs, fill, { left: 0, top: w * 0.3, width: w, height: w * 0.32, borderRadius: w }]} />
    </View>
  )
}

/** Lo que cae de la nube: rayas (lluvia), puntos (llovizna), copos huecos (nieve) o un rayo. */
function Under({ kind, size }: { kind: Kind; size: number }) {
  const palette = usePalette()
  const s = size
  const top = s * 0.66
  const xs = [0.26, 0.47, 0.68]
  if (kind === 'tormenta') {
    // Rayo en zigzag: dos barras inclinadas unidas por una horizontal. Con
    // solo las dos inclinadas quedaban en línea y parecía un palo.
    const t = Math.max(2, s * 0.09)
    const bar = { width: t, height: s * 0.2, borderRadius: s, backgroundColor: palette.fg }
    return (
      <>
        <View style={[styles.abs, bar, { left: s * 0.46, top: s * 0.58, transform: [{ rotate: '30deg' }] }]} />
        <View style={[styles.abs, { left: s * 0.42, top: s * 0.705, width: s * 0.2, height: t, borderRadius: s, backgroundColor: palette.fg }]} />
        <View style={[styles.abs, bar, { left: s * 0.5, top: s * 0.72, transform: [{ rotate: '30deg' }] }]} />
      </>
    )
  }
  return (
    <>
      {xs.map((x) => {
        if (kind === 'lluvia')
          return (
            <View
              key={x}
              style={[
                styles.abs,
                { left: s * x, top, width: Math.max(1.5, s * 0.07), height: s * 0.24, borderRadius: s, backgroundColor: palette.fg, transform: [{ rotate: '20deg' }] },
              ]}
            />
          )
        const d = Math.max(3, s * (kind === 'nieve' ? 0.15 : 0.11))
        return (
          <View
            key={x}
            style={[
              styles.abs,
              kind === 'nieve'
                ? { borderWidth: Math.max(1, s * 0.035), borderColor: palette.fg }
                : { backgroundColor: palette.fg },
              { left: s * x, top: top + s * 0.06, width: d, height: d, borderRadius: d },
            ]}
          />
        )
      })}
    </>
  )
}

/** Niebla: tres bandas de distinto largo. */
function Fog({ size }: { size: number }) {
  const palette = usePalette()
  const s = size
  const h = Math.max(2, s * 0.1)
  return (
    <>
      {[
        { top: 0.24, left: 0.1, w: 0.8 },
        { top: 0.46, left: 0.18, w: 0.72 },
        { top: 0.68, left: 0.06, w: 0.66 },
      ].map((b) => (
        <View key={b.top} style={[styles.abs, { top: s * b.top, left: s * b.left, width: s * b.w, height: h, borderRadius: h, backgroundColor: palette.muted }]} />
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
})
