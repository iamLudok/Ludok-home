import { useEffect, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Sheet } from '../ui/Sheet'
import { Field } from '../ui/Field'
import { Chips } from '../ui/Chips'
import { Button } from '../ui/Button'
import { Txt } from '../ui/Text'
import { DayPicker } from '../ui/Pickers'
import { useToast } from '../ui/Toast'
import { space } from '../ui/theme'
import { addFuel, addOther, deleteExpense, fuelTotalCents, KIND_LABEL, KINDS, updateExpense } from '../lib/car'
import { formatDecimal, formatEuros, parseDecimal, parseEuros } from '../lib/money'
import { today } from '../lib/dates'
import type { CarExpense, CarExpenseKind } from '../types'

const KIND_OPTIONS = KINDS.map((k) => ({ key: k, label: KIND_LABEL[k] }))

/**
 * Apuntar o editar un gasto. Con `expense` edita ese; sin él, crea uno nuevo.
 *
 * En la gasolina el total se calcula solo con litros × precio, pero se puede
 * escribir el del ticket encima: el surtidor redondea a su manera y lo que
 * cuenta es lo que pagaste.
 */
export function ExpenseForm({
  visible,
  expense,
  onClose,
}: {
  visible: boolean
  expense?: CarExpense
  onClose: () => void
}) {
  const toast = useToast()
  const [kind, setKind] = useState<CarExpenseKind>('gasolina')
  const [date, setDate] = useState(today())
  const [liters, setLiters] = useState('')
  const [price, setPrice] = useState('')
  const [total, setTotal] = useState('')
  const [km, setKm] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Al abrir, rellenar con el gasto a editar o dejarlo en blanco.
  useEffect(() => {
    if (!visible) return
    setError(null)
    setKind(expense?.kind ?? 'gasolina')
    setDate(expense?.date ?? today())
    setLiters(expense?.liters !== undefined ? formatDecimal(expense.liters) : '')
    setPrice(expense?.pricePerLiter !== undefined ? formatDecimal(expense.pricePerLiter, 3) : '')
    setTotal(expense ? formatEuros(expense.totalCents, false) : '')
    setKm(expense?.odometerKm !== undefined ? String(expense.odometerKm) : '')
    setDescription(expense?.description ?? '')
  }, [visible, expense])

  const l = parseDecimal(liters)
  const p = parseDecimal(price)
  const computed = l && p ? fuelTotalCents(l, p) : null

  const save = async () => {
    setError(null)
    try {
      const cents = parseEuros(total)
      const odometer = km.trim() ? Number(km.replace(/\D/g, '')) : undefined
      if (kind === 'gasolina') {
        if (!l) throw new Error('Faltan los litros.')
        if (!p) throw new Error('Falta el precio por litro.')
        const totalCents = cents ?? computed!
        if (expense) {
          await updateExpense(expense.id, {
            kind, date, liters: l, pricePerLiter: p, totalCents, odometerKm: odometer, description: undefined,
          })
        } else {
          await addFuel({ date, liters: l, pricePerLiter: p, totalCents, odometerKm: odometer })
        }
      } else {
        if (!cents) throw new Error('Falta el importe.')
        if (expense) {
          if (!description.trim()) throw new Error('Falta la descripción.')
          await updateExpense(expense.id, {
            kind, date, totalCents: cents, description: description.trim(),
            liters: undefined, pricePerLiter: undefined, odometerKm: undefined,
          })
        } else {
          await addOther({ date, kind, description, totalCents: cents })
        }
      }
      toast(expense ? 'Gasto actualizado' : 'Gasto apuntado')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const remove = () => {
    if (!expense) return
    Alert.alert('Borrar gasto', 'No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await deleteExpense(expense.id)
          toast('Gasto borrado')
          onClose()
        },
      },
    ])
  }

  return (
    <Sheet visible={visible} title={expense ? 'Editar gasto' : 'Apuntar gasto'} onClose={onClose}>
      <Chips options={KIND_OPTIONS} value={kind} onChange={setKind} />
      <DayPicker label="Día" value={date} onChange={setDate} />

      {kind === 'gasolina' ? (
        <>
          <View style={styles.row}>
            <Field label="Litros" value={liters} onChangeText={setLiters} keyboardType="decimal-pad" placeholder="40" />
            <Field label="€ por litro" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="1,659" />
          </View>
          <View style={styles.row}>
            <Field
              label="Total"
              value={total}
              onChangeText={setTotal}
              keyboardType="decimal-pad"
              placeholder={computed ? formatEuros(computed, false) : '€'}
              hint={computed && !total.trim() ? `Se apuntará ${formatEuros(computed)}` : 'Si lo dejas vacío, litros × precio'}
            />
            <Field label="Km del coche" value={km} onChangeText={setKm} keyboardType="number-pad" placeholder="Opcional" hint="Para el consumo" />
          </View>
        </>
      ) : (
        <>
          <Field
            label="Qué fue"
            value={description}
            onChangeText={setDescription}
            placeholder={kind === 'taller' ? 'Cambio de aceite' : 'Escobillas'}
          />
          <Field label="Importe" value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="€" />
        </>
      )}

      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : null}

      <View style={styles.actions}>
        <Button title="Guardar" kind="primary" onPress={save} style={styles.grow} />
        {expense ? <Button title="Borrar" kind="danger" onPress={remove} /> : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  grow: { flex: 1 },
})
