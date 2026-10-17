import { StyleSheet, View } from 'react-native'
import { Txt } from '../ui/Text'
import { Tick } from '../ui/Tick'
import { useToast } from '../ui/Toast'
import { space } from '../ui/theme'
import { markTaken, unmarkTaken, type TodayMedicine } from '../lib/medicines'
import { syncMedicineReminders } from '../lib/notifications'

/** Las medicinas que tocan hoy, con su casilla. */
export function TodayMedicines({ items, day }: { items: TodayMedicine[]; day: string }) {
  const toast = useToast()

  const toggle = async ({ medicine, taken }: TodayMedicine) => {
    try {
      if (taken) await unmarkTaken(medicine.id, day)
      else await markTaken(medicine.id, day)
      // Al marcarla se cancelan los repasos de hoy; al desmarcarla, vuelven.
      await syncMedicineReminders()
      if (!taken) toast(`${medicine.name}: tomada`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  if (items.length === 0) {
    return (
      <Txt variant="small" tone="muted">
        Hoy no te toca ninguna.
      </Txt>
    )
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item.medicine.id} style={styles.row}>
          <Tick
            on={item.taken}
            onPress={() => toggle(item)}
            label={item.taken ? `Desmarcar ${item.medicine.name}` : `Marcar ${item.medicine.name} como tomada`}
          />
          <View style={styles.text}>
            <Txt variant="body" tone={item.taken ? 'muted' : 'fg'} style={item.taken ? styles.done : undefined}>
              {item.medicine.name}
            </Txt>
            <Txt variant="data" tone="faint">
              {item.taken ? 'Tomada' : `A las ${item.medicine.time}`}
              {item.medicine.everyDays > 1 ? ` · cada ${item.medicine.everyDays} días` : ''}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: 2 },
  done: { textDecorationLine: 'line-through' },
})
