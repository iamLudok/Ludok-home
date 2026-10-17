import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useShareIntentContext } from 'expo-share-intent'
import { Sheet } from '../ui/Sheet'
import { Chips } from '../ui/Chips'
import { Button } from '../ui/Button'
import { Txt } from '../ui/Text'
import { useToast } from '../ui/Toast'
import { space } from '../ui/theme'
import { SavedForm } from './SavedForm'
import { ItemForm } from './ItemForm'
import { useList, useSaved } from '../hooks/useData'
import { useToday } from '../hooks/useToday'
import { amazonAsin, hostOf, splitShared } from '../lib/linkPreview'
import { giftsByPerson } from '../lib/lists'
import { tagCounts } from '../lib/saved'
import { addNote } from '../lib/notes'

type Target = 'guardados' | 'wishlist' | 'regalos' | 'nota'

const TARGETS = [
  { key: 'guardados' as const, label: 'Guardados' },
  { key: 'wishlist' as const, label: 'Wishlist' },
  { key: 'regalos' as const, label: 'Regalos' },
  { key: 'nota' as const, label: 'Nota' },
]

/** Adónde va lo compartido si no dices nada: un reel a guardados, Amazon a la wishlist. */
function suggest(url: string | null): Target {
  if (!url) return 'nota'
  // La app de Amazon comparte enlaces cortos (amzn.eu), sin el código del producto.
  if (amazonAsin(url) || /^(amzn\.(eu|to)|a\.co)$/.test(hostOf(url))) return 'wishlist'
  // Vídeos y webs, a guardados: compartir desde una tienda que no sea Amazon
  // es raro, y se cambia con un toque.
  return 'guardados'
}

/**
 * Lo que llega con «Compartir → Ludok Home» desde otra app. Primero se elige
 * adónde va y luego se abre el formulario de siempre ya relleno, para que
 * guardar un reel sean dos toques: destino y etiqueta.
 */
export function ShareReceiver() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext()
  const toast = useToast()
  const day = useToday()
  const saved = useSaved()
  const regalos = useList('regalos')
  const [target, setTarget] = useState<Target>('guardados')
  const [step, setStep] = useState<'elegir' | 'formulario'>('elegir')

  const shared = useMemo(() => {
    const raw = [shareIntent?.webUrl, shareIntent?.text].filter(Boolean).join(' ')
    const { url, rest } = splitShared(raw)
    return { url, title: shareIntent?.meta?.title || rest || undefined, text: (shareIntent?.text ?? '').trim() }
  }, [shareIntent])

  useEffect(() => {
    if (!hasShareIntent) return
    setTarget(suggest(shared.url))
    setStep('elegir')
  }, [hasShareIntent, shared.url])

  const done = () => {
    setStep('elegir')
    resetShareIntent()
  }

  const next = async () => {
    if (target === 'nota') {
      try {
        await addNote(shared.text || shared.url || '', day)
        toast('Apuntada para hoy')
      } catch (e) {
        toast(e instanceof Error ? e.message : 'No se pudo guardar')
      }
      done()
      return
    }
    setStep('formulario')
  }

  if (!hasShareIntent) return null

  const initial = { url: shared.url ?? undefined, title: shared.title, name: shared.title }
  const canLink = !!shared.url

  return (
    <>
      <Sheet visible={step === 'elegir'} title="¿Dónde lo guardo?" onClose={done}>
        <Txt variant="small" tone="muted" numberOfLines={3}>
          {shared.url ? `${shared.title ? shared.title + ' · ' : ''}${hostOf(shared.url)}` : shared.text}
        </Txt>
        <Chips options={canLink ? TARGETS : TARGETS.filter((t) => t.key === 'nota')} value={target} onChange={setTarget} />
        <View style={styles.actions}>
          <Button title={target === 'nota' ? 'Apuntar para hoy' : 'Seguir'} kind="primary" onPress={next} style={styles.grow} />
          <Button title="Cancelar" kind="ghost" onPress={done} />
        </View>
      </Sheet>

      {step === 'formulario' && target === 'guardados' ? (
        <SavedForm visible knownTags={tagCounts(saved.data).map((c) => c.tag)} initial={initial} onClose={done} />
      ) : null}
      {step === 'formulario' && (target === 'wishlist' || target === 'regalos') ? (
        <ItemForm
          visible
          list={target}
          people={giftsByPerson(regalos.data).map((g) => g.person)}
          initial={initial}
          onClose={done}
        />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  grow: { flex: 1 },
})
