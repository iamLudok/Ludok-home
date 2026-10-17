import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { Sheet } from '../ui/Sheet'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { Txt } from '../ui/Text'
import { TimePicker } from '../ui/Pickers'
import { usePalette } from '../ui/ThemeProvider'
import { useToast } from '../ui/Toast'
import { radius, space } from '../ui/theme'
import { addMedicine, cleanTimes, deleteMedicine, resetHistory, updateMedicine } from '../lib/medicines'
import { shortDate } from '../lib/format'
import { syncMedicineReminders } from '../lib/notifications'
import type { Medicine } from '../types'

/** Primer repaso por defecto: hora y media después de la toma. */
function nextReminder(time: string, existing: string[]): string {
  const [h, m] = time.split(':').map(Number)
  const base = h * 60 + m + 90 + existing.length * 120
  const mins = Math.min(base, 23 * 60 + 59)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export function MedicineForm({
  visible,
  medicine,
  onClose,
}: {
  visible: boolean
  medicine?: Medicine
  onClose: () => void
}) {
  const palette = usePalette()
  const toast = useToast()
  const [name, setName] = useState('')
  const [everyDays, setEveryDays] = useState('1')
  const [time, setTime] = useState('08:00')
  const [reminders, setReminders] = useState<string[]>([])
  const [active, setActive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setError(null)
    setName(medicine?.name ?? '')
    setEveryDays(String(medicine?.everyDays ?? 1))
    setTime(medicine?.time ?? '08:00')
    setReminders(medicine?.reminders ?? [])
    setActive(medicine?.active ?? true)
  }, [visible, medicine])

  const save = async () => {
    setError(null)
    try {
      const input = {
        name,
        everyDays: Number(everyDays),
        time,
        reminders: cleanTimes(reminders).filter((r) => r !== time),
      }
      if (medicine) await updateMedicine(medicine.id, { ...input, active })
      else await addMedicine(input)
      await syncMedicineReminders()
      toast(medicine ? 'Pauta guardada' : 'Medicina añadida')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const restart = () => {
    if (!medicine) return
    Alert.alert(
      `Empezar de cero con ${medicine.name}`,
      'Se borra todo su historial de tomas y empieza a contar desde hoy. Hoy te tocará tomarla. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Empezar de cero',
          style: 'destructive',
          onPress: async () => {
            await resetHistory(medicine.id)
            await syncMedicineReminders()
            toast(`${medicine.name}: empieza hoy`)
            onClose()
          },
        },
      ],
    )
  }

  const remove = () => {
    if (!medicine) return
    Alert.alert(
      `Borrar ${medicine.name}`,
      'Se borra también todo su historial de tomas. Si solo la has dejado de tomar, mejor desactívala: así su historial se queda.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar todo',
          style: 'destructive',
          onPress: async () => {
            await deleteMedicine(medicine.id)
            await syncMedicineReminders()
            toast('Medicina borrada')
            onClose()
          },
        },
      ],
    )
  }

  return (
    <Sheet visible={visible} title={medicine ? medicine.name : 'Nueva medicina'} onClose={onClose}>
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Elebrato" autoCapitalize="sentences" />
      <View style={styles.row}>
        <Field
          label="Cada cuántos días"
          value={everyDays}
          onChangeText={setEveryDays}
          keyboardType="number-pad"
          hint={everyDays === '1' ? 'Todos los días' : everyDays === '2' ? 'Cada 48 h' : undefined}
        />
        <TimePicker label="Hora de la toma" value={time} onChange={setTime} />
      </View>

      <Txt variant="label" tone="muted">
        Avisos de repaso
      </Txt>
      <Txt variant="small" tone="faint">
        A la hora de la toma llega el primer aviso. Estos llegan después solo si aún no la has marcado.
      </Txt>
      {reminders.map((r, i) => (
        <View key={`${i}-${r}`} style={styles.reminder}>
          <TimePicker
            label={`Repaso ${i + 1}`}
            value={r}
            onChange={(t) => setReminders(reminders.map((x, j) => (j === i ? t : x)))}
          />
          <Button title="Quitar" kind="ghost" small onPress={() => setReminders(reminders.filter((_, j) => j !== i))} style={styles.remove} />
        </View>
      ))}
      <Button title="Añadir repaso" small onPress={() => setReminders([...reminders, nextReminder(time, reminders)])} style={styles.selfStart} />

      {medicine ? (
        <Pressable
          onPress={() => setActive(!active)}
          accessibilityRole="switch"
          accessibilityState={{ checked: active }}
          style={({ pressed }) => [styles.toggle, { borderColor: palette.line, opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.dot, { borderColor: active ? palette.fg : palette.line, backgroundColor: active ? palette.fg : 'transparent' }]} />
          <View style={styles.grow}>
            <Txt variant="small" style={{ fontWeight: '600' }}>
              {active ? 'La sigo tomando' : 'Ya no la tomo'}
            </Txt>
            <Txt variant="data" tone="faint">
              Desactivada no avisa, pero su historial se queda en el gráfico.
            </Txt>
          </View>
        </Pressable>
      ) : null}

      {medicine ? (
        <View style={styles.restart}>
          <Txt variant="small" tone="faint">
            Cuenta desde el {shortDate(medicine.startDate)}. Si has cambiado de tratamiento, puedes borrar su historial y
            empezar a contar desde hoy.
          </Txt>
          <Button title="Empezar de cero desde hoy" small onPress={restart} style={styles.selfStart} />
        </View>
      ) : null}

      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : null}

      <View style={styles.actions}>
        <Button title="Guardar" kind="primary" onPress={save} style={styles.grow} />
        {medicine ? <Button title="Borrar" kind="danger" onPress={remove} /> : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  reminder: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  remove: { marginBottom: space.xs },
  selfStart: { alignSelf: 'flex-start' },
  restart: { gap: space.sm },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
  },
  dot: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: 2 },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  grow: { flex: 1 },
})
