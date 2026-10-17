// Lo que se hace al abrir la app y al volver a ella: copia a Nextcloud, tareas
// y eventos de hoy, noticias de la Pi y reprogramar los avisos de medicinas.
//
// Nada de esto va en segundo plano (Android mata esas tareas sin avisar). Cada
// paso falla por su cuenta sin tumbar a los demás: sin conexión, la copia y las
// noticias fallan, pero los avisos se reprograman igual, que es lo importante.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { maybeAutoBackup } from '../lib/autoBackup'
import { refreshToday } from '../lib/today'
import { localNews, syncNews, type LocalNews } from '../lib/news'
import { syncMedicineReminders } from '../lib/notifications'

export interface SyncState {
  refreshing: boolean
  /** Error al hablar con Nextcloud en la última vuelta, si lo hubo. */
  error?: string
  news: LocalNews | null
  refresh: () => Promise<void>
}

const SyncContext = createContext<SyncState>({
  refreshing: false,
  news: null,
  refresh: async () => {},
})

export function SyncProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [news, setNews] = useState<LocalNews | null>(null)
  const running = useRef(false)

  const refresh = useCallback(async () => {
    // Volver a la app dos veces seguidas no lanza dos vueltas a la vez.
    if (running.current) return
    running.current = true
    setRefreshing(true)
    try {
      // Lo que ya hay en el móvil primero, para que el reproductor salga al
      // momento aunque la descarga de las nuevas tarde o falle.
      setNews(await localNews().catch(() => null))
      const [today, newsResult] = await Promise.all([
        refreshToday(),
        syncNews(),
        syncMedicineReminders().catch(() => 0),
        maybeAutoBackup().catch(() => null),
      ])
      if ('news' in newsResult) setNews(newsResult.news)
      setError(today.status === 'error' ? today.message : newsResult.status === 'error' ? newsResult.message : undefined)
    } finally {
      running.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
      // Al salir solo la copia: si solo se hiciera al abrir, una sesión larga
      // apuntando gastos se quedaría sin subir hasta la próxima vez.
      if (state === 'background') maybeAutoBackup().catch(() => {})
    })
    return () => sub.remove()
  }, [enabled, refresh])

  return (
    <SyncContext.Provider value={{ refreshing, error, news, refresh }}>{children}</SyncContext.Provider>
  )
}

export function useSync(): SyncState {
  return useContext(SyncContext)
}
