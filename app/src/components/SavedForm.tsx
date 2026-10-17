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
import { addSaved, deleteSaved, normalizeTags, updateSaved } from '../lib/saved'
import { cleanLink, fetchPreview, hostOf, kindFromUrl } from '../lib/linkPreview'
import type { SavedLink } from '../types'

/** Para arrancar con algo cuando aún no tienes etiquetas propias. */
const STARTER_TAGS = ['receta', 'app', 'portfolio', 'web', 'idea']

/**
 * Guardar o editar un enlace para luego. Las etiquetas se escriben separadas
 * por comas o se tocan las que ya existen: tocar es más rápido que escribir
 * «receta» por enésima vez, y así no acaban «receta» y «recetas» por separado.
 */
export function SavedForm({
  visible,
  link,
  knownTags,
  initial,
  onClose,
}: {
  visible: boolean
  link?: SavedLink
  knownTags: string[]
  initial?: { url?: string; title?: string }
  onClose: () => void
}) {
  const palette = usePalette()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagText, setTagText] = useState('')
  const [note, setNote] = useState('')
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const [previewFor, setPreviewFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setError(null)
    setUrl(link?.url ?? initial?.url ?? '')
    setTitle(link?.title ?? initial?.title ?? '')
    setTags(link?.tags ?? [])
    setTagText('')
    setNote(link?.note ?? '')
    setImageUrl(link?.imageUrl)
    setPreviewFor(link?.url ?? null)
  }, [visible, link, initial])

  const loadPreview = async () => {
    const clean = cleanLink(url)
    if (!/^https?:\/\//i.test(clean) || clean === previewFor) return { imageUrl, title: undefined as string | undefined }
    setLoading(true)
    const p = await fetchPreview(clean)
    setLoading(false)
    setPreviewFor(clean)
    setImageUrl(p.imageUrl)
    if (!title.trim() && p.title) setTitle(p.title)
    return p
  }

  useEffect(() => {
    if (visible && !link && initial?.url) loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, link, initial])

  const toggle = (tag: string) => setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag])

  const allTags = normalizeTags([...tags, ...normalizeTags(tagText)])
  const suggestions = useMemo(
    () => normalizeTags([...knownTags, ...STARTER_TAGS]).filter((t) => !tags.includes(t)).slice(0, 12),
    [knownTags, tags],
  )

  const save = async () => {
    setError(null)
    try {
      const p = await loadPreview()
      const finalTitle = title.trim() || p.title?.trim() || undefined
      if (link) {
        await updateSaved(link.id, { title: finalTitle ?? '', tags: allTags, note, imageUrl: p.imageUrl ?? imageUrl })
        toast('Guardado')
      } else {
        const res = await addSaved({ url, title: finalTitle, tags: allTags, note, imageUrl: p.imageUrl ?? imageUrl })
        toast(res.existed ? 'Ya lo tenías: le he añadido las etiquetas' : 'Guardado para luego')
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const remove = () => {
    if (!link) return
    Alert.alert('Borrar', link.title ?? hostOf(link.url), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await deleteSaved(link.id)
          onClose()
        },
      },
    ])
  }

  const kind = url.trim() ? kindFromUrl(cleanLink(url)) : null

  return (
    <Sheet visible={visible} title={link ? 'Editar' : 'Guardar para luego'} onClose={onClose}>
      <View style={styles.preview}>
        {loading ? (
          <View style={[styles.loading, { backgroundColor: palette.surface2 }]}>
            <ActivityIndicator color={palette.muted} />
          </View>
        ) : (
          <Thumb imageUrl={imageUrl} label={title || hostOf(url) || '?'} size={72} />
        )}
        <View style={styles.previewText}>
          <Txt variant="small" numberOfLines={2} style={styles.bold}>
            {title || (url.trim() ? hostOf(cleanLink(url)) : 'Pega un enlace')}
          </Txt>
          {kind ? (
            <Txt variant="data" tone="faint">
              {kind === 'video' ? 'Vídeo' : 'Web'}
            </Txt>
          ) : null}
        </View>
      </View>

      {link ? null : (
        <Field label="Enlace" value={url} onChangeText={setUrl} onBlur={loadPreview} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
      )}
      <Field label="Título" value={title} onChangeText={setTitle} placeholder="Opcional: sale solo del enlace" autoCapitalize="sentences" />

      <Txt variant="label" tone="muted">
        Etiquetas
      </Txt>
      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((t) => (
            <Pressable key={t} onPress={() => toggle(t)} accessibilityRole="button" accessibilityLabel={`Quitar ${t}`} style={[styles.tag, { backgroundColor: palette.fg, borderColor: palette.fg }]}>
              <Txt variant="small" style={{ color: palette.onFg, fontWeight: '600' }}>
                {t} ×
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.tags}>
        {suggestions.map((t) => (
          <Pressable key={t} onPress={() => toggle(t)} accessibilityRole="button" style={({ pressed }) => [styles.tag, { borderColor: palette.line, opacity: pressed ? 0.6 : 1 }]}>
            <Txt variant="small" tone="muted">
              {t}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Field value={tagText} onChangeText={setTagText} placeholder="Otra etiqueta (separa con comas)" autoCapitalize="none" />

      <Field label="Nota" value={note} onChangeText={setNote} placeholder="Opcional: por qué lo guardas" multiline autoCapitalize="sentences" />

      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : null}

      <View style={styles.actions}>
        <Button title="Guardar" kind="primary" onPress={save} disabled={loading} style={styles.grow} />
        {link ? <Button title="Borrar" kind="danger" onPress={remove} /> : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  loading: { width: 72, height: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  previewText: { flex: 1, gap: 2 },
  bold: { fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: space.xs, paddingHorizontal: space.md },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  grow: { flex: 1 },
})
