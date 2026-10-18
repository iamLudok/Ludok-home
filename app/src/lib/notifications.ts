// Avisos de medicinas: notificaciones LOCALES programadas en el propio móvil.
//
// No hay servidor ni tarea en segundo plano: Android guarda las alarmas y las
// lanza aunque la app esté cerrada (y las restaura al reiniciar el móvil). Lo
// único que hace la app es reprogramarlas al abrirse y cada vez que cambia algo
// (una toma, una pauta), a partir de `reminderPlan`, que es la parte probada.
//
// Por qué avisos sueltos con fecha y no uno diario repetido: uno repetido no se
// puede cancelar solo para hoy, y tomarte la medicina a las 8 tiene que
// silenciar los repasos de las 9:30 y las 13:00 de HOY, no los de mañana.
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { listIntakes, listMedicines, reminderPlan } from './medicines'

const CHANNEL = 'medicinas'

/** Lo que va en `data` de cada aviso, para saber a qué medicina se refiere al tocarlo. */
export interface ReminderData {
  kind: 'medicina'
  medicineId: string
  day: string
}

Notifications.setNotificationHandler({
  // Con la app abierta también se enseña: si estás en ella a las 8 y no lo ves,
  // el aviso no ha servido de nada.
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/**
 * Crea el canal y pide permiso. En Android 13+ el diálogo de permiso NO sale
 * hasta que existe al menos un canal, así que el orden importa.
 * Devuelve si se pueden mandar avisos.
 */
export async function ensureNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Medicinas',
      description: 'Avisos para tomar las medicinas',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    })
  }
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  return (await Notifications.requestPermissionsAsync()).granted
}

let syncing: Promise<number> | null = null

/**
 * Cancela todo lo programado y vuelve a programar según la pauta y las tomas
 * actuales. Devuelve cuántos avisos quedan programados.
 *
 * Si ya hay una sincronización en marcha se espera a esa: dos a la vez
 * (marcar una toma justo al abrir la app) podían cancelar y programar
 * entrelazadas y dejar avisos duplicados.
 */
export function syncMedicineReminders(): Promise<number> {
  if (!syncing) {
    syncing = doSync().finally(() => {
      syncing = null
    })
  }
  return syncing
}

async function doSync(): Promise<number> {
  const granted = (await Notifications.getPermissionsAsync()).granted
  // La app solo programa avisos de medicinas, así que se puede borrar todo.
  await Notifications.cancelAllScheduledNotificationsAsync()
  if (!granted) return 0

  const meds = (await listMedicines()).filter((m) => m.active)
  const plan = reminderPlan(meds, await listIntakes())
  for (const r of plan) {
    const data: ReminderData = { kind: 'medicina', medicineId: r.medicineId, day: r.day }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: r.kind === 'toma' ? `Toca ${r.medicineName}` : `¿Has tomado ${r.medicineName}?`,
        body: r.kind === 'toma' ? 'Toca para marcarla como tomada.' : 'Sigue sin marcar. Toca para marcarla.',
        data: { ...data },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
    })
  }
  return plan.length
}

export function isReminderData(data: unknown): data is ReminderData {
  return typeof data === 'object' && data !== null && (data as ReminderData).kind === 'medicina'
}
