import { Pressable, StyleSheet, View } from 'react-native'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { radius, space } from './theme'
import { atTime, dayOf } from '../lib/dates'
import { shortDate } from '../lib/format'
import type { DayString, TimeString } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Botón con aspecto de campo que abre el selector nativo de Android. Se usa la
 * API imperativa (`DateTimePickerAndroid.open`) y no el componente: el
 * componente en Android es un diálogo que hay que montar y desmontar a mano, y
 * si se queda montado vuelve a abrirse solo al repintar la pantalla.
 */
function PickerButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const palette = usePalette()
  return (
    <View style={styles.wrap}>
      <Txt variant="label" tone="muted">
        {label}
      </Txt>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={({ pressed }) => [
          styles.button,
          { borderColor: palette.line, backgroundColor: palette.bg, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Txt variant="body">{value}</Txt>
      </Pressable>
    </View>
  )
}

export function DayPicker({ label, value, onChange }: { label: string; value: DayString; onChange: (d: DayString) => void }) {
  const open = () =>
    DateTimePickerAndroid.open({
      value: atTime(value, '12:00'),
      mode: 'date',
      // Un gasto del futuro no tiene sentido y casi siempre es un dedo torpe.
      maximumDate: new Date(),
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(dayOf(date))
      },
    })
  return <PickerButton label={label} value={shortDate(value)} onPress={open} />
}

export function TimePicker({ label, value, onChange }: { label: string; value: TimeString; onChange: (t: TimeString) => void }) {
  const open = () =>
    DateTimePickerAndroid.open({
      value: atTime('2000-01-01', value),
      mode: 'time',
      is24Hour: true,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(`${pad(date.getHours())}:${pad(date.getMinutes())}`)
      },
    })
  return <PickerButton label={label} value={value} onPress={open} />
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, flex: 1 },
  button: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
})
