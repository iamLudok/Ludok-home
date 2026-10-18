import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { radius, space } from './theme'

/**
 * Hoja que sube desde abajo para los formularios (añadir un gasto, editar una
 * medicina). Se cierra tocando fuera o con «atrás» de Android.
 *
 * Es un `Modal` y no una pantalla del `Stack` a propósito: un gasto se apunta
 * en diez segundos en la gasolinera, y una pantalla nueva con su animación y su
 * «atrás» hace que parezca un trámite.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose} accessibilityLabel="Cerrar" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: palette.surface, borderColor: palette.line, paddingBottom: insets.bottom + space.lg },
          ]}
        >
          <View style={[styles.grip, { backgroundColor: palette.line }]} />
          <Txt variant="title">{title}</Txt>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: StyleSheet.absoluteFill,
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
    maxHeight: '90%',
  },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill },
  body: { gap: space.md, paddingBottom: space.sm },
})
