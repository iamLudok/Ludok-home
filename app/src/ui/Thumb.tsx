import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { usePalette } from './ThemeProvider'
import { Txt } from './Text'
import { radius } from './theme'
import { photoUri } from '../lib/photos'

/**
 * Miniatura de un elemento: la foto propia si hay, si no la vista previa del
 * enlace, y si no un hueco con la inicial. `expo-image` y no el `Image` de
 * React Native porque guarda las imágenes en disco: sin eso, cada vez que se
 * abría la wishlist se volvían a descargar todas.
 */
export function Thumb({ photo, imageUrl, label, size = 56 }: { photo?: string; imageUrl?: string; label: string; size?: number }) {
  const palette = usePalette()
  const uri = photo ? photoUri(photo) : imageUrl
  const box = { width: size, height: size, borderRadius: radius.md, backgroundColor: palette.surface2 }
  if (!uri) {
    return (
      <View style={[box, styles.empty]}>
        <Txt variant="section" tone="faint">
          {label.trim().charAt(0).toUpperCase()}
        </Txt>
      </View>
    )
  }
  return <Image source={{ uri }} style={box} contentFit="cover" cachePolicy="disk" transition={120} accessibilityIgnoresInvertColors />
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
})
