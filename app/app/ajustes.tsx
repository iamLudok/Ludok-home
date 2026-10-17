import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { Screen } from '../src/ui/Screen'
import { Card, DataRow } from '../src/ui/Card'
import { Txt } from '../src/ui/Text'
import { Button } from '../src/ui/Button'
import { Chips } from '../src/ui/Chips'
import { useToast } from '../src/ui/Toast'
import { space } from '../src/ui/theme'
import { useSettings } from '../src/hooks/useSettings'
import { useCarExpenses, useIntakes, useList, useMedicines, useNotes, useSaved } from '../src/hooks/useData'
import { useSync } from '../src/hooks/useSync'
import { updateSettings } from '../src/lib/settings'
import { daysSinceBackup, importBackup, pickJsonFile, shareBackup } from '../src/lib/backup'
import { importFromBotNotes } from '../src/lib/notesImport'
import { ensureNotifications, syncMedicineReminders } from '../src/lib/notifications'
import { configFrom } from '../src/lib/nextcloud'
import { NextcloudSettings } from '../src/components/NextcloudSettings'

const THEMES = [
  { key: 'system' as const, label: 'Sistema' },
  { key: 'dark' as const, label: 'Oscuro' },
  { key: 'light' as const, label: 'Claro' },
]

export default function Ajustes() {
  const settings = useSettings()
  const toast = useToast()
  const sync = useSync()
  const car = useCarExpenses()
  const meds = useMedicines()
  const intakes = useIntakes()
  const compra = useList('compra')
  const wishlist = useList('wishlist')
  const regalos = useList('regalos')
  const notes = useNotes()
  const saved = useSaved()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const days = daysSinceBackup(settings.lastBackup)
  const lastBackupText = !settings.lastBackup ? 'nunca' : days === 0 ? 'hoy' : `hace ${days} ${days === 1 ? 'día' : 'días'}`
  const listCount = compra.data.length + wishlist.data.length + regalos.data.length

  const doExport = async () => {
    setBusy(true)
    try {
      await shareBackup()
    } catch (e) {
      Alert.alert('No se pudo exportar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async (raw: string, mode: 'replace' | 'merge') => {
    setBusy(true)
    try {
      const res = await importBackup(raw, mode)
      await syncMedicineReminders()
      const extra = res.discardedIntakes ? `\n\nSe descartaron ${res.discardedIntakes} tomas de medicinas que no venían en la copia.` : ''
      Alert.alert(
        'Copia restaurada',
        `${res.carExpenses} gastos, ${res.medicines} medicinas, ${res.intakes} tomas, ${res.listItems} elementos de listas, ${res.notes} notas y ${res.saved} guardados.${extra}`,
      )
    } catch (e) {
      Alert.alert('Error al importar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    try {
      const raw = await pickJsonFile()
      if (!raw) return
      // Se pregunta DESPUÉS de elegir el fichero, para decidir sabiendo ya qué copia es.
      Alert.alert('Restaurar copia', '¿Reemplazar todo lo que hay ahora, o combinar añadiendo sin borrar?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Combinar', onPress: () => runImport(raw, 'merge') },
        { text: 'Reemplazar', style: 'destructive', onPress: () => runImport(raw, 'replace') },
      ])
    } catch (e) {
      Alert.alert('No se pudo leer', e instanceof Error ? e.message : 'Error desconocido')
    }
  }

  const doBotImport = async () => {
    setBusy(true)
    try {
      const r = await importFromBotNotes()
      await syncMedicineReminders()
      const lines = [
        `${r.carExpenses} gastos del coche`,
        `${r.medicines} medicinas${r.inactiveMedicines.length ? ` (y ${r.inactiveMedicines.join(', ')} desactivadas, para no perder su historial)` : ''}`,
        `${r.intakes} tomas`,
        `${r.listItems} elementos de listas`,
      ]
      if (r.missingNotes.length) lines.push(`\nNo estaban estas notas: ${r.missingNotes.join(', ')}.`)
      if (r.issues.length) {
        lines.push(`\n${r.issues.length} líneas no se entendieron y se han saltado:`)
        lines.push(...r.issues.slice(0, 5).map((i) => `· ${i.note}: ${i.line}`))
      }
      Alert.alert('Datos del bot importados', lines.join('\n'))
    } catch (e) {
      Alert.alert('No se pudo importar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const testReminder = async () => {
    if (!(await ensureNotifications())) {
      Alert.alert('Avisos desactivados', 'Actívalos en los ajustes del móvil para esta app.')
      return
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Aviso de prueba', body: 'Si ves esto, los avisos de medicinas te llegarán.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, channelId: 'medicinas' },
    })
    toast('Llegará en 10 segundos. Puedes cerrar la app.')
  }

  return (
    <Screen title="Ajustes" padded={false} right={<Button title="Volver" kind="ghost" small onPress={() => router.back()} />}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Txt variant="title">Copia de seguridad</Txt>
          <Txt variant="small" tone="muted">
            Tus datos viven en este móvil. La copia automática los sube a tu Nextcloud; también puedes exportarla a mano.
          </Txt>
          <View style={styles.stats}>
            <DataRow label="Gastos del coche" value={String(car.data.length)} />
            <DataRow label="Medicinas" value={String(meds.data.length)} />
            <DataRow label="Tomas apuntadas" value={String(intakes.data.length)} />
            <DataRow label="Elementos en listas" value={String(listCount)} />
            <DataRow label="Notas pendientes" value={String(notes.data.length)} />
            <DataRow label="Guardados" value={String(saved.data.length)} />
            <DataRow label="Última copia" value={lastBackupText} />
          </View>
          <Button title="Exportar copia" kind="primary" onPress={doExport} disabled={busy} />
          <Button title="Restaurar copia" onPress={doImport} disabled={busy} />
        </Card>

        <NextcloudSettings />

        {!settings.notesImportedAt ? (
          <Card>
            <Txt variant="title">Datos del bot de Telegram</Txt>
            <Txt variant="small" tone="muted">
              Trae una sola vez lo que guardaba el bot en Nextcloud Notes: gastos del coche, medicinas con su historial,
              compra, wishlist y regalos. Las notas no se tocan.
            </Txt>
            <Button
              title={busy ? 'Importando…' : 'Importar del bot'}
              kind="primary"
              onPress={doBotImport}
              disabled={busy || !configFrom(settings)}
            />
            {!configFrom(settings) ? (
              <Txt variant="small" tone="faint">
                Configura antes Nextcloud aquí arriba.
              </Txt>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <Txt variant="title">Avisos de medicinas</Txt>
          <Txt variant="small" tone="muted">
            Se programan en el propio móvil para los próximos 14 días y se reprograman cada vez que abres la app. Llegan
            aunque la app esté cerrada y sin conexión.
          </Txt>
          <Button title="Probar un aviso" onPress={testReminder} />
        </Card>

        <Card>
          <Txt variant="title">Tema</Txt>
          <Chips options={THEMES} value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
        </Card>

        <Button title={sync.refreshing ? 'Actualizando…' : 'Actualizar todo ahora'} kind="ghost" onPress={sync.refresh} disabled={sync.refreshing} />

        <Txt variant="small" tone="faint" style={styles.footer}>
          Ludok Home · tus datos, en tu casa.
        </Txt>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  stats: { gap: space.xs },
  footer: { textAlign: 'center' },
})
