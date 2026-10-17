import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import * as Notifications from 'expo-notifications'
import { Screen, Empty } from '../../src/ui/Screen'
import { Card, SectionTitle } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Chips } from '../../src/ui/Chips'
import { space } from '../../src/ui/theme'
import { AdherenceGrid } from '../../src/components/AdherenceGrid'
import { MedicineForm } from '../../src/components/MedicineForm'
import { TodayMedicines } from '../../src/components/TodayMedicines'
import { useIntakes, useMedicines } from '../../src/hooks/useData'
import { useToday } from '../../src/hooks/useToday'
import { adherence, medicinesForDay } from '../../src/lib/medicines'
import { addDays } from '../../src/lib/dates'
import { ensureNotifications, syncMedicineReminders } from '../../src/lib/notifications'
import type { Medicine } from '../../src/types'

const PERIODS = [
  { key: 'semanas' as const, label: '2 semanas' },
  { key: 'mes' as const, label: 'Mes' },
]
/** 2 semanas en fila (caben con su símbolo); el mes, como calendario por medicina. */
const DAYS = { semanas: 14, mes: 30 }

function everyLabel(m: Medicine): string {
  if (m.everyDays === 1) return 'Todos los días'
  if (m.everyDays === 2) return 'Cada 48 h'
  return `Cada ${m.everyDays} días`
}

/** Si el sistema deja mandar avisos. Se vuelve a mirar al volver a la app (por si se cambió en Ajustes). */
function useNotificationsGranted(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null)
  const check = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then((p) => setGranted(p.granted))
      .catch(() => setGranted(null))
  }, [])
  useEffect(() => {
    check()
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check())
    return () => sub.remove()
  }, [check])
  return granted
}

export default function Medicinas() {
  const day = useToday()
  const meds = useMedicines()
  const intakes = useIntakes()
  const granted = useNotificationsGranted()
  const [form, setForm] = useState<{ open: boolean; medicine?: Medicine }>({ open: false })
  const [period, setPeriod] = useState<'semanas' | 'mes'>('semanas')

  const todayMeds = useMemo(() => medicinesForDay(meds.data, intakes.data, day), [meds.data, intakes.data, day])
  const rows = useMemo(
    () => adherence(meds.data, intakes.data, addDays(day, -(DAYS[period] - 1)), day, day),
    [meds.data, intakes.data, day, period],
  )
  const active = meds.data.filter((m) => m.active)
  const inactive = meds.data.filter((m) => !m.active)

  const askPermission = async () => {
    const ok = await ensureNotifications()
    if (ok) await syncMedicineReminders()
    else Linking.openSettings()
  }

  const ready = meds.ready && intakes.ready

  return (
    <Screen
      title="Medicinas"
      right={<Button title="Añadir" kind="primary" small onPress={() => setForm({ open: true })} />}
    >
      {!ready ? null : meds.data.length === 0 ? (
        <Empty text="No tienes ninguna medicina. Añádela con su hora y te avisará aunque la app esté cerrada.">
          <Button title="Añadir medicina" kind="primary" onPress={() => setForm({ open: true })} />
        </Empty>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {granted === false ? (
            <Card>
              <Txt variant="section" tone="warn">
                Los avisos están desactivados
              </Txt>
              <Txt variant="small" tone="muted">
                Sin permiso de notificaciones no te llegará ningún recordatorio.
              </Txt>
              <Button title="Activar avisos" small onPress={askPermission} style={styles.selfStart} />
            </Card>
          ) : null}

          <Card>
            <SectionTitle title="Hoy" />
            <TodayMedicines items={todayMeds} day={day} />
          </Card>

          <Card>
            <SectionTitle title="Registro" />
            <Chips options={PERIODS} value={period} onChange={setPeriod} />
            <AdherenceGrid rows={rows} layout={period === 'mes' ? 'mes' : 'fila'} />
          </Card>

          <Card>
            <SectionTitle title="Pauta" />
            {active.map((m) => (
              <MedicineRow key={m.id} medicine={m} onPress={() => setForm({ open: true, medicine: m })} />
            ))}
            {inactive.length > 0 ? (
              <>
                <SectionTitle title="Ya no las tomo" />
                {inactive.map((m) => (
                  <MedicineRow key={m.id} medicine={m} onPress={() => setForm({ open: true, medicine: m })} />
                ))}
              </>
            ) : null}
          </Card>
        </ScrollView>
      )}
      <MedicineForm visible={form.open} medicine={form.medicine} onClose={() => setForm({ open: false })} />
    </Screen>
  )
}

function MedicineRow({ medicine, onPress }: { medicine: Medicine; onPress: () => void }) {
  const times = [medicine.time, ...medicine.reminders].join(', ')
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Editar la pauta"
      style={({ pressed }) => [styles.medRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.grow}>
        <Txt variant="body" tone={medicine.active ? 'fg' : 'muted'}>
          {medicine.name}
        </Txt>
        <Txt variant="data" tone="faint">
          {medicine.active ? `${everyLabel(medicine)} · avisos a las ${times}` : 'Desactivada'}
        </Txt>
      </View>
      <Txt variant="small" tone="faint">
        Editar
      </Txt>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingBottom: space.xxl },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1, gap: 2 },
  selfStart: { alignSelf: 'flex-start' },
})
