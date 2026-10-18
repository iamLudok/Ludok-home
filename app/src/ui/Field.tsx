import { forwardRef } from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { radius, space, type } from './theme'

interface Props extends TextInputProps {
  label?: string
  /** Texto pequeño debajo: unidades, formato esperado o el error. */
  hint?: string
  error?: boolean
}

/** Campo de texto con etiqueta. El único `TextInput` que usan las pantallas. */
export const Field = forwardRef<TextInput, Props>(function Field({ label, hint, error, style, ...rest }, ref) {
  const palette = usePalette()
  return (
    <View style={styles.wrap}>
      {label ? (
        <Txt variant="label" tone="muted">
          {label}
        </Txt>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={palette.faint}
        {...rest}
        style={[
          styles.input,
          type.body,
          {
            borderColor: error ? palette.danger : palette.line,
            color: palette.fg,
            backgroundColor: palette.bg,
          },
          style,
        ]}
      />
      {hint ? (
        <Txt variant="small" tone={error ? 'danger' : 'faint'}>
          {hint}
        </Txt>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  // flexGrow y no flex: 1. En una fila (casilla + botón) ocupa el hueco que
  // queda; en una columna, flex: 1 deja la base en 0 y la casilla se quedaba
  // sin altura, escribiendo sin que se viera nada.
  wrap: { gap: space.xs, flexGrow: 1, flexShrink: 1 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
})
