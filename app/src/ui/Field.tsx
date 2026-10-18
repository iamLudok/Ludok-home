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
  wrap: { gap: space.xs, flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
})
