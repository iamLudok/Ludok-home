import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { radius, space, type } from '../ui/theme'
import { KIND_LABEL, KINDS, type MonthTotals } from '../lib/car'
import { formatEuros } from '../lib/money'
import { monthShort } from '../lib/format'
import type { CarExpenseKind } from '../types'

const HEIGHT = 168
const AXIS_W = 44
const BOTTOM = 20
const TOP = 8
/** Hueco del color del fondo entre segmentos apilados (y entre barras). */
const GAP = 2
const CORNER = 4

/** Redondea el máximo del eje a un número limpio: 137 € → 150 €. */
function niceMax(cents: number): number {
  if (cents <= 0) return 10_000
  const euros = cents / 100
  const pow = 10 ** Math.floor(Math.log10(euros))
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= euros)! * pow
  return step * 100
}

/** Rectángulo con solo las esquinas de arriba redondeadas (el extremo del dato). */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

/**
 * Gasto mensual del coche, barras apiladas por tipo. Tocar una barra la
 * selecciona y enseña su desglose debajo: es el «tooltip» de un móvil, donde no
 * hay ratón con el que pasar por encima.
 */
export function CarChart({
  months,
  selected,
  onSelect,
}: {
  months: MonthTotals[]
  selected: string
  onSelect: (month: string) => void
}) {
  const palette = usePalette()
  const [width, setWidth] = useState(0)
  const colors: Record<CarExpenseKind, string> = {
    gasolina: palette.series1,
    taller: palette.series2,
    recambio: palette.series3,
  }

  const max = niceMax(Math.max(...months.map((m) => m.total)))
  const plotW = Math.max(0, width - AXIS_W)
  const plotH = HEIGHT - BOTTOM - TOP
  const slot = months.length ? plotW / months.length : 0
  const barW = Math.min(28, slot * 0.6)
  const y = (cents: number) => TOP + plotH - (cents / max) * plotH
  const ticks = [0, max / 2, max]

  return (
    <View style={styles.wrap}>
      <View style={styles.legend} accessibilityRole="text">
        {KINDS.map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors[k] }]} />
            <Txt variant="small" tone="muted">
              {KIND_LABEL[k]}
            </Txt>
          </View>
        ))}
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {ticks.map((t) => (
              <Line
                key={t}
                x1={AXIS_W}
                x2={width}
                y1={y(t)}
                y2={y(t)}
                stroke={palette.line}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            {ticks.map((t) => (
              <SvgText
                key={`l${t}`}
                x={AXIS_W - space.sm}
                y={y(t) + 4}
                fill={palette.faint}
                fontSize={type.data.fontSize - 1}
                textAnchor="end"
              >
                {`${Math.round(t / 100)} €`}
              </SvgText>
            ))}

            {months.map((m, i) => {
              const x = AXIS_W + i * slot + (slot - barW) / 2
              const dim = selected !== m.month
              // Segmentos de abajo arriba en el orden fijo de la leyenda; solo
              // el último (el de arriba) lleva las esquinas redondeadas.
              const segs = KINDS.filter((k) => m[k] > 0)
              let acc = 0
              return segs.map((k, j) => {
                const top = y(acc + m[k])
                const bottom = y(acc)
                acc += m[k]
                // Cada segmento salvo el de abajo deja GAP px libres por debajo:
                // ese hueco es lo que separa los colores sin necesidad de borde.
                const h = Math.max(0, bottom - top - (j > 0 ? GAP : 0))
                const opacity = dim ? 0.45 : 1
                return j === segs.length - 1 ? (
                  <Path key={k} d={topRounded(x, top, barW, h, CORNER)} fill={colors[k]} opacity={opacity} />
                ) : (
                  <Rect key={k} x={x} y={top} width={barW} height={h} fill={colors[k]} opacity={opacity} />
                )
              })
            })}

            {months.map((m, i) => (
              <SvgText
                key={`x${m.month}`}
                x={AXIS_W + i * slot + slot / 2}
                y={HEIGHT - 4}
                fill={selected === m.month ? palette.fg : palette.faint}
                fontSize={type.data.fontSize - 1}
                fontWeight={selected === m.month ? '700' : '500'}
                textAnchor="middle"
              >
                {monthShort(m.month)}
              </SvgText>
            ))}
          </Svg>
        ) : null}

        {/* Zonas de toque más anchas que la barra: toda la columna del mes. */}
        <View style={[StyleSheet.absoluteFill, styles.hits, { left: AXIS_W }]}>
          {months.map((m) => (
            <Pressable
              key={m.month}
              style={styles.hit}
              onPress={() => onSelect(m.month)}
              accessibilityRole="button"
              accessibilityLabel={`${monthShort(m.month)}: ${formatEuros(m.total)}`}
              accessibilityState={{ selected: selected === m.month }}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 10, height: 10, borderRadius: radius.sm / 2 },
  hits: { flexDirection: 'row' },
  hit: { flex: 1 },
})
