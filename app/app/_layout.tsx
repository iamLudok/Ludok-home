// Tiene que ir ANTES que cualquier otra cosa: el motor de React Native (Hermes)
// no trae `URL` ni `URLSearchParams` completos, y cualquier código que monte
// direcciones con ellos revienta sin esto.
import 'react-native-url-polyfill/auto'
import { useEffect, useState } from 'react'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import { ShareIntentProvider } from 'expo-share-intent'
// Importar `db` crea el esquema de forma síncrona: para cuando esto se
// evalúa, las tablas ya existen y cualquier pantalla puede consultar.
import '../src/lib/db'
import { ensureSettings } from '../src/lib/settings'
import { ensureNotifications, isReminderData, syncMedicineReminders } from '../src/lib/notifications'
import { SyncProvider } from '../src/hooks/useSync'
import { ShareReceiver } from '../src/components/ShareReceiver'
import { ThemeProvider, usePalette, useIsDark } from '../src/ui/ThemeProvider'
import { ToastProvider } from '../src/ui/Toast'
import { Txt } from '../src/ui/Text'
import { space } from '../src/ui/theme'

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Las tablas ya están creadas (al importar `db`). Aquí solo se persisten
    // los ajustes por defecto la primera vez.
    ensureSettings()
      .then(() => setReady(true))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Error al abrir la base de datos'),
      )
  }, [])

  // El permiso de avisos se pide al arrancar y no al crear la primera
  // medicina: tras importar los datos del bot ya hay medicinas sin que hayas
  // pasado por ese formulario, y se quedarían sin avisar.
  useEffect(() => {
    if (!ready) return
    ensureNotifications()
      .then(async (granted) => {
        if (granted) await syncMedicineReminders()
      })
      .catch(() => {})
  }, [ready])

  // ShareIntentProvider por fuera de todo, como pide la librería: tiene que
  // escuchar el enlace compartido desde el primer instante, antes de que la
  // base de datos o el tema estén listos, o el primer «compartir» se pierde.
  return (
    <ShareIntentProvider options={{ resetOnBackground: true }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <SyncProvider enabled={ready}>
              <Shell ready={ready} error={error} />
            </SyncProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  )
}

/** Tocar un aviso de medicina abre la pestaña de medicinas, que es donde se marca. */
function useOpenRemindersOnTap(enabled: boolean) {
  const router = useRouter()
  const response = Notifications.useLastNotificationResponse()
  useEffect(() => {
    if (!enabled || !response) return
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return
    if (!isReminderData(response.notification.request.content.data)) return
    router.navigate('/medicinas')
    // Se limpia para que volver a abrir la app no vuelva a saltar a medicinas.
    Notifications.clearLastNotificationResponseAsync().catch(() => {})
  }, [enabled, response, router])
}

function Shell({ ready, error }: { ready: boolean; error: string | null }) {
  const palette = usePalette()
  const isDark = useIsDark()
  useOpenRemindersOnTap(ready)

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Txt variant="body" tone="danger" style={{ textAlign: 'center' }}>
          {error}
        </Txt>
      </View>
    )
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator color={palette.muted} />
      </View>
    )
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ajustes" />
      </Stack>
      <ShareReceiver />
    </>
  )
}
