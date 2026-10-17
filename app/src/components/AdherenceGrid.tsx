import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { radius, space } from '../ui/theme'
import { shortDate } from '../lib/format'
import type { AdherenceRow, DayState } from '../lib/medicines'

const STATE_LABEL: Record<DayState, string> = {
  tomada: 'Tomada',
  olvidada: 'Olvidada',
  pendiente: 'Pendiente hoy',
  nada: 'No tocaba',
}

/** El símbolo de cada estado: el color nunca va solo (daltonismo, pantalla al sol). */
const GLYPH: Record<DayState, string> = { tomada: '✓', olvidada: '×', pendiente: '!', nada: '' }

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Lunes = 0 … domingo = 6 (el calendario empieza en lunes, como aquí). */
function weekdayMon(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

/**
 * Calendario de adherencia. Tocar una celda dice qué pasó ese día, que es lo
 * que en un ordenador haría el tooltip.
 *
 * - `fila`: una fila por medicina, una columna por día (para dos semanas).
 * - `mes`: cada medicina como un calendario de 7 columnas. Con 30 días en una
 *   sola fila cada casilla se quedaba en 8 px y el símbolo no se leía.
 */
export function AdherenceGrid({ rows, layout = 'fila' }: { rows: AdherenceRow[]; layout?: 'fila' | 'mes' }) {
  const palette = usePalette()
  const [picked, setPicked] = useState<{ name: string; day: string; state: DayState } | null>(null)
  const fill: Record<DayState, string> = {
    tomada: palette.taken,
    olvidada: palette.missed,
    pendiente: palette.pending,
    nada: palette.surface2,
  }
  const ink: Record<DayState, string> = {
    tomada: palette.onStatus,
    olvidada: palette.onStatus,
    pendiente: palette.onPending,
    nada: palette.faint,
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        {(['tomada', 'olvidada', 'pendiente'] as const).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendCell, { backgroundColor: fill[s] }]}>
              <Txt variant="data" style={[styles.glyph, { color: ink[s] }]}>
                {GLYPH[s]}
              </Txt>
            </View>
            <Txt variant="small" tone="muted">
              {STATE_LABEL[s]}
            </Txt>
          </View>
        ))}
      </View>

      {rows.map((row) => (
        <View key={row.medicine.id} style={styles.row}>
          <View style={styles.rowHead}>
            <Txt variant="small" numberOfLines={1} style={styles.name}>
              {row.medicine.name}
              {row.medicine.active ? '' : ' (ya no)'}
            </Txt>
            <Txt variant="data" tone="muted">
              {row.percent === null ? '' : `${row.percent} %`}
            </Txt>
          </View>
          {layout === 'fila' ? (
            <View style={styles.cells}>
              {row.days.map(({ day, state }) => (
                <Pressable
                  key={day}
                  onPress={() => setPicked({ name: row.medicine.name, day, state })}
                  hitSlop={2}
                  accessibilityLabel={`${row.medicine.name}, ${shortDate(day)}: ${STATE_LABEL[state]}`}
                  style={[styles.cell, { backgroundColor: fill[state] }]}
                >
                  <Txt variant="data" style={[styles.glyph, { color: ink[state] }]}>
                    {GLYPH[state]}
                  </Txt>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.month}>
              <View style={styles.week}>
                {WEEKDAYS.map((w) => (
                  <Txt key={w} variant="data" tone="faint" style={styles.weekday}>
                    {w}
                  </Txt>
                ))}
              </View>
              {weeksOf(row.days).map((week, wi) => (
                <View key={wi} style={styles.week}>
                  {week.map((cell, ci) =>
                    cell ? (
                      <Pressable
                        key={cell.day}
                        onPress={() => setPicked({ name: row.medicine.name, day: cell.day, state: cell.state })}
                        accessibilityLabel={`${row.medicine.name}, ${shortDate(cell.day)}: ${STATE_LABEL[cell.state]}`}
                        style={[styles.monthCell, { backgroundColor: fill[cell.state] }]}
                      >
                        <Txt variant="data" style={[styles.dayNum, { color: ink[cell.state] }]}>
                          {Number(cell.day.slice(8))}
                        </Txt>
                        <Txt variant="data" style={[styles.glyph, { color: ink[cell.state] }]}>
                          {GLYPH[cell.state]}
                        </Txt>
                      </Pressable>
                    ) : (
                      <View key={`e${ci}`} style={styles.monthEmpty} />
                    ),
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      <Txt variant="small" tone={picked ? 'fg' : 'faint'}>
        {picked
          ? `${picked.name}, ${shortDate(picked.day)}: ${STATE_LABEL[picked.state].toLowerCase()}`
          : 'Toca un día para ver qué pasó.'}
      </Txt>
    </View>
  )
}

/** Parte los días en semanas de lunes a domingo, con huecos al principio y al final. */
function weeksOf<T extends { day: string }>(days: T[]): (T | null)[][] {
  if (days.length === 0) return []
  const cells: (T | null)[] = [...Array(weekdayMon(days[0].day)).fill(null), ...days]
  while (cells.length % 7) cells.push(null)
  const weeks: (T | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendCell: { width: 14, height: 14, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  row: { gap: space.xs },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  name: { flex: 1, fontWeight: '600' },
  // Celdas que se reparten el ancho: con 14 días caben holgadas en cualquier móvil.
  cells: { flexDirection: 'row', gap: 2 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 10, lineHeight: 12, fontWeight: '700' },
  month: { gap: 3 },
  week: { flexDirection: 'row', gap: 3 },
  weekday: { flex: 1, textAlign: 'center' },
  monthCell: { flex: 1, aspectRatio: 1.15, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  monthEmpty: { flex: 1, aspectRatio: 1.15 },
  dayNum: { fontSize: 9, lineHeight: 11, opacity: 0.85 },
})
