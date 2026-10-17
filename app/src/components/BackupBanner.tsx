import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useSettings } from '../hooks/useSettings'
import { daysSinceBackup, shareBackup } from '../lib/backup'
import { backupNow } from '../lib/autoBackup'
import { autoBackupIsStale, STALE_DAYS } from '../lib/backupPolicy'
import { usePalette } from '../ui/ThemeProvider'
import { Txt } from '../ui/Text'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'
import { radius, space } from '../ui/theme'

/**
 * Aviso cuando llevas mucho sin copia. Es la red de seguridad principal contra
 * perder datos, así que se muestra en Hoy y no escondido en Ajustes.
 */
export function BackupBanner({ itemCount }: { itemCount: number }) {
  const settings = useSettings()
  const palette = usePalette()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  // Sin datos aún no hay nada que respaldar.
  if (itemCount === 0) return null

  const days = daysSinceBackup(settings.lastBackup)
  const never = days === Infinity
  // La automática encendida pero sin subir nada es el caso peligroso: te crees
  // respaldado y no lo estás.
  const stale = autoBackupIsStale(settings)
  // Solo molestamos si nunca has hecho copia, hace más de una semana, o la
  // automática lleva días fallando.
  if (!never && days < 7 && !stale) return null

  // Si tiene Nextcloud configurado, se reintenta ahí; si no, se comparte a mano.
  const doBackup = async () => {
    setBusy(true)
    try {
      if (settings.autoBackup) {
        const res = await backupNow()
        toast(res.status === 'ok' ? 'Copia subida' : 'No se pudo subir; prueba a exportarla')
        if (res.status === 'ok') return
      }
      await shareBackup()
    } catch {
      toast('No se pudo crear la copia')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.wrap, { borderColor: never ? palette.danger : palette.warn }]}>
      <Txt variant="small" tone={never ? 'danger' : 'warn'} style={styles.text}>
        {never
          ? 'Aún no has hecho ninguna copia. Guárdala para no perder tus datos.'
          : stale
            ? `La copia automática lleva más de ${STALE_DAYS} días sin subir. ¿La Pi está encendida?`
            : `Llevas ${days} días sin copia de seguridad.`}
      </Txt>
      <Button title={busy ? '…' : 'Hacer copia'} small onPress={doBackup} disabled={busy} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  text: { flex: 1 },
})
