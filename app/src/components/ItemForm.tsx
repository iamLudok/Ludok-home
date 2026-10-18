import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native'
import { Sheet } from '../ui/Sheet'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { Txt } from '../ui/Text'
import { Thumb } from '../ui/Thumb'
import { usePalette } from '../ui/ThemeProvider'
import { useToast } from '../ui/Toast'
import { radius, space } from '../ui/theme'
import { addItem, cleanUrl, NO_ONE, removeItem, updateItem } from '../lib/lists'
import { fetchPreview } from '../lib/linkPreview'
import { deletePhoto, pickPhoto } from '../lib/photos'
import type { ListItem, ListKind } from '../types'

/**
 * Añadir o editar algo de la wishlist o de regalos: nombre, enlace, para quién
 * (regalos) y la imagen. La imagen se saca sola del enlace; si no sale (o no
 * te gusta), se elige una foto de la galería, que manda sobre la del enlace.
 */
export function ItemForm({
  visible,
  list,
  item,
  people,
  initial,
  onClose,
}: {
  visible: boolean
  list: Exclude<ListKind, 'compra'>
  item?: ListItem
  /** Personas que ya salen en regalos, para elegir sin escribir. */
  people: string[]
  /** Para cuando llega algo compartido desde otra app. */
  initial?: { name?: string; url?: string }
  onClose: () => void
}) {
  const palette = usePalette()
  const toast = useToast()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [forWhom, setForWhom] = useState('')
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const [photo, setPhoto] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewFor, setPreviewFor] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setError(null)
    setName(item?.name ?? initial?.name ?? '')
    setUrl(item?.url ?? initial?.url ?? '')
    setForWhom(item?.forWhom ?? '')
    setImageUrl(item?.imageUrl)
    setPhoto(item?.photo)
    setPreviewFor(item?.url ?? null)
  }, [visible, item, initial])

  /** Trae la vista previa del enlace (y el título, si aún no hay nombre). */
  const loadPreview = async (): Promise<{ imageUrl?: string; title?: string }> => {
    let link: string | undefined
    try {
      link = cleanUrl(url)
    } catch {
      return {}
    }
    if (!link || link === previewFor) return { imageUrl }
    setLoading(true)
    const p = await fetchPreview(link)
    setLoading(false)
    setPreviewFor(link)
    setImageUrl(p.imageUrl)
    if (!name.trim() && p.title) setName(p.title)
    return p
  }

  // Al llegar algo compartido, la vista previa se pide sola.
  useEffect(() => {
    if (visible && !item && initial?.url) loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item, initial])

  const choosePhoto = async () => {
    try {
      const picked = await pickPhoto()
      if (!picked) return
      // La foto anterior, si era nueva de este formulario, ya no la usa nadie.
      if (photo && photo !== item?.photo) deletePhoto(photo)
      setPhoto(picked)
    } catch {
      toast('No se pudo cargar la foto')
    }
  }

  const close = () => {
    // Una foto elegida pero no guardada no se queda huérfana en la carpeta.
    if (photo && photo !== item?.photo) deletePhoto(photo)
    onClose()
  }

  const save = async () => {
    setError(null)
    try {
      const p = await loadPreview()
      const finalName = name.trim() || p.title?.trim() || ''
      if (!finalName) throw new Error('Falta el nombre.')
      const extras = { url: url.trim() || undefined, forWhom, imageUrl: p.imageUrl ?? imageUrl, photo }
      if (item) {
        if (item.photo && item.photo !== photo) deletePhoto(item.photo)
        await updateItem(item.id, { name: finalName, ...extras })
      } else {
        const created = await addItem(list, finalName, extras)
        if (!created) throw new Error('Eso ya está en la lista.')
      }
      toast(item ? 'Guardado' : 'Añadido')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const remove = () => {
    if (!item) return
    Alert.alert('Quitar', item.name, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          deletePhoto(await removeItem(item.id))
          if (photo && photo !== item.photo) deletePhoto(photo)
          onClose()
        },
      },
    ])
  }

  const suggestions = useMemo(
    () => people.filter((p) => p !== NO_ONE && p.toLowerCase() !== forWhom.trim().toLowerCase()).slice(0, 8),
    [people, forWhom],
  )

  return (
    <Sheet visible={visible} title={item ? 'Editar' : list === 'regalos' ? 'Idea de regalo' : 'A la wishlist'} onClose={close}>
      <View style={styles.preview}>
        {loading ? (
          <View style={[styles.loading, { backgroundColor: palette.surface2 }]}>
            <ActivityIndicator color={palette.muted} />
          </View>
        ) : (
          <Thumb photo={photo} imageUrl={imageUrl} label={name || '?'} size={72} />
        )}
        <View style={styles.previewActions}>
          <Button title={photo ? 'Cambiar foto' : 'Poner foto'} small onPress={choosePhoto} />
          {photo ? (
            <Button
              title="Quitar foto"
              kind="ghost"
              small
              onPress={() => {
                // La recién elegida se borra ya; la que estaba guardada, al guardar.
                if (photo !== item?.photo) deletePhoto(photo)
                setPhoto(undefined)
              }}
            />
          ) : null}
          {!photo && !imageUrl && url.trim() && !loading ? (
            <Txt variant="data" tone="faint">
              El enlace no trae imagen
            </Txt>
          ) : null}
        </View>
      </View>

      <Field label="Qué es" value={name} onChangeText={setName} placeholder={list === 'regalos' ? 'Un libro de cocina' : 'Auriculares'} autoCapitalize="sentences" />
      <Field
        label="Enlace"
        value={url}
        onChangeText={setUrl}
        onBlur={loadPreview}
        placeholder="Opcional"
        autoCapitalize="none"
        keyboardType="url"
        hint="La imagen se saca sola del enlace"
      />

      {list === 'regalos' ? (
        <>
          <Field label="Para quién" value={forWhom} onChangeText={setForWhom} placeholder="Laura, Pablo…" autoCapitalize="words" />
          {suggestions.length > 0 ? (
            <View style={styles.people}>
              {suggestions.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setForWhom(p)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.person, { borderColor: palette.line, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Txt variant="small" tone="muted">
                    {p}
                  </Txt>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : null}

      <View style={styles.actions}>
        <Button title="Guardar" kind="primary" onPress={save} disabled={loading} style={styles.grow} />
        {item ? <Button title="Quitar" kind="danger" onPress={remove} /> : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  loading: { width: 72, height: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  previewActions: { flex: 1, gap: space.sm, alignItems: 'flex-start' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  person: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: space.xs, paddingHorizontal: space.md },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  grow: { flex: 1 },
})
