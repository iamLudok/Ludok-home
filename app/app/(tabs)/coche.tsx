import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Screen, Empty } from '../../src/ui/Screen'
import { Card, DataRow, SectionTitle } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { usePalette } from '../../src/ui/ThemeProvider'
import { space } from '../../src/ui/theme'
import { CarChart } from '../../src/components/CarChart'
import { ExpenseForm } from '../../src/components/ExpenseForm'
import { useCarExpenses } from '../../src/hooks/useData'
import { useToday } from '../../src/hooks/useToday'
import { averageConsumption, averagePricePerLiter, KIND_LABEL, KINDS, monthlyTotals } from '../../src/lib/car'
import { lastMonths, monthOf } from '../../src/lib/dates'
import { formatDecimal, formatEuros, formatThousands } from '../../src/lib/money'
import { monthLong, shortDate } from '../../src/lib/format'
import type { CarExpense } from '../../src/types'

const MONTHS = 6

export default function Coche() {
  const palette = usePalette()
  const day = useToday()
  const { data: expenses, ready } = useCarExpenses()
  const [form, setForm] = useState<{ open: boolean; expense?: CarExpense }>({ open: false })
  const months = useMemo(() => lastMonths(MONTHS, new Date(`${day}T12:00:00`)), [day])
  const [selected, setSelected] = useState<string | null>(null)
  const current = selected && months.includes(selected) ? selected : months[months.length - 1]

  const totals = useMemo(() => monthlyTotals(expenses, months), [expenses, months])
  const month = totals.find((t) => t.month === current)!
  const ofMonth = expenses.filter((e) => monthOf(e.date) === current)
  const consumption = averageConsumption(expenses)
  const price = averagePricePerLiter(expenses)
  const sixTotal = totals.reduce((s, t) => s + t.total, 0)

  const kindColor = { gasolina: palette.series1, taller: palette.series2, recambio: palette.series3 }

  return (
    <Screen
      title="Coche"
      right={<Button title="Apuntar" kind="primary" small onPress={() => setForm({ open: true })} />}
    >
      {!ready ? null : expenses.length === 0 ? (
        <Empty text="Todavía no hay gastos. Apunta el primer repostaje y el gráfico empieza a crecer.">
          <Button title="Apuntar gasto" kind="primary" onPress={() => setForm({ open: true })} />
        </Empty>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <SectionTitle title={monthLong(current)} />
            <Txt variant="display">{formatEuros(month.total)}</Txt>
            <View style={styles.kinds}>
              {KINDS.map((k) => (
                <View key={k} style={styles.kind}>
                  <View style={[styles.swatch, { backgroundColor: kindColor[k] }]} />
                  <Txt variant="small" tone="muted" style={styles.kindLabel}>
                    {KIND_LABEL[k]}
                  </Txt>
                  <Txt variant="data">{formatEuros(month[k])}</Txt>
                </View>
              ))}
            </View>
            {month.liters > 0 ? (
              <Txt variant="data" tone="faint">
                {formatDecimal(month.liters)} litros este mes
              </Txt>
            ) : null}
          </Card>

          <Card>
            <SectionTitle title={`Últimos ${MONTHS} meses`} />
            <CarChart months={totals} selected={current} onSelect={setSelected} />
            {/* La tabla es la vista accesible del gráfico: las mismas cifras sin depender del color. */}
            <View style={[styles.table, { borderTopColor: palette.line }]}>
              {[...totals].reverse().map((t) => (
                <Pressable key={t.month} onPress={() => setSelected(t.month)} accessibilityRole="button">
                  <DataRow label={monthLong(t.month)} value={formatEuros(t.total)} strong={t.month === current} />
                </Pressable>
              ))}
              <DataRow label={`Total ${MONTHS} meses`} value={formatEuros(sixTotal)} strong />
            </View>
          </Card>

          {consumption !== null || price !== null ? (
            <Card>
              <SectionTitle title="Gasolina" />
              {consumption !== null ? <DataRow label="Consumo medio" value={`${formatDecimal(consumption, 1)} L/100 km`} /> : null}
              {price !== null ? <DataRow label="Precio medio pagado" value={`${formatDecimal(price, 3)} €/L`} /> : null}
              {consumption === null ? (
                <Txt variant="small" tone="faint">
                  Apunta los km del coche al repostar y aquí saldrá el consumo.
                </Txt>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <SectionTitle title={`Gastos de ${monthLong(current)}`} />
            {ofMonth.length === 0 ? (
              <Txt variant="small" tone="muted">
                Ninguno.
              </Txt>
            ) : (
              ofMonth.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => setForm({ open: true, expense: e })}
                  accessibilityRole="button"
                  accessibilityHint="Editar o borrar"
                  style={({ pressed }) => [styles.expense, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <View style={[styles.swatch, { backgroundColor: kindColor[e.kind] }]} />
                  <View style={styles.expenseText}>
                    <Txt variant="body" numberOfLines={1}>
                      {e.kind === 'gasolina'
                        ? `${formatDecimal(e.liters ?? 0)} L a ${formatDecimal(e.pricePerLiter ?? 0, 3)} €/L`
                        : e.description}
                    </Txt>
                    <Txt variant="data" tone="faint">
                      {shortDate(e.date, day)} · {KIND_LABEL[e.kind]}
                      {e.odometerKm !== undefined ? ` · ${formatThousands(e.odometerKm)} km` : ''}
                    </Txt>
                  </View>
                  <Txt variant="data">{formatEuros(e.totalCents)}</Txt>
                </Pressable>
              ))
            )}
          </Card>
        </ScrollView>
      )}
      <ExpenseForm visible={form.open} expense={form.expense} onClose={() => setForm({ open: false })} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingBottom: space.xxl },
  kinds: { gap: space.sm },
  kind: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kindLabel: { flex: 1 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  table: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: space.sm },
  expense: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  expenseText: { flex: 1, gap: 2 },
})
