import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { radius, space } from './theme'

/**
 * Avisos breves, el equivalente del `toast()` de la web. Se monta una sola vez
 * en la raíz y se dispara con `useToast()`. Aparece arriba y no bloquea nada;
 * los mensajes que exigen decisión usan `Alert` en su lugar.
 */
const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const palette = usePalette()
  const insets = useSafeAreaInsets()

  const show = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current)
      setMessage(text)
      Animated.timing(opacity, { toValue: 1, duration: 130, useNativeDriver: true }).start()
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          ({ finished }) => finished && setMessage(null),
        )
      }, 2200)
    },
    [opacity],
  )

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message !== null && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { top: insets.top + space.sm, opacity },
          ]}
        >
          <View style={[styles.pill, { backgroundColor: palette.fg }]}>
            <Txt variant="small" style={{ color: palette.onFg, fontWeight: '600' }}>
              {message}
            </Txt>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): (message: string) => void {
  return useContext(ToastContext)
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  pill: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
})
