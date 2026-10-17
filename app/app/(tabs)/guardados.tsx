import { useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Screen, Empty } from '../../src/ui/Screen'
import { Chips } from '../../src/ui/Chips'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Tick } from '../../src/ui/Tick'
import { Thumb } from '../../src/ui/Thumb'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'
import { SavedForm } from '../../src/components/SavedForm'
import { useSaved } from '../../src/hooks/useData'
import { filterSaved, setSavedDone, tagCounts } from '../../src/lib/saved'
import { hostOf } from '../../src/lib/linkPreview'
import type { SavedLink } from '../../src/types'

const STATES = [
  { key: 'pendientes' as const, label: 'Para luego' },
  { key: 'hechos' as const, label: 'Hechos' },
]

const ALL = '__todas__'

/**
 * Lo que encuentras y quieres hacer más tarde: reels de recetas, apps que
 * probar, portfolios de los que sacar ideas, webs que te han llamado la
 * atención. Lo normal es meterlo desde Instagram o el navegador con
 * «Compartir → Ludok Home»; el botón de aquí es para pegar un enlace a mano.
 */
export default function Guardados() {
  const palette = usePalette()
  const toast = useToast()
  const { data: links, ready } = useSaved()
  const [state, setState] = useState<'pendientes' | 'hechos'>('pendientes')
  const [tag, setTag] = useState<string>(ALL)
  const [form, setForm] = useState<{ open: boolean; link?: SavedLink }>({ open: false })

  const counts = useMemo(() => tagCounts(links), [links])
  const tagOptions = useMemo(
    () => [{ key: ALL, label: 'Todo' }, ...counts.map((c) => ({ key: c.tag, label: `${c.tag} ${c.count}` }))],
    [counts],
  )
  const shown = useMemo(
    () => filterSaved(links, { tag: tag === ALL ? undefined : tag, done: state === 'hechos' }),
    [links, tag, state],
  )

  const markDone = async (l: SavedLink) => {
    await setSavedDone(l.id, !l.done)
    toast(l.done ? 'Vuelve a «para luego»' : 'Hecho')
  }

  return (
    <Screen title="Guardados" right={<Button title="Pegar enlace" kind="primary" small onPress={() => setForm({ open: true })} />}>
      {!ready ? null : links.length === 0 ? (
        <Empty text="Aquí va lo que quieres ver o probar más tarde. Desde Instagram o el navegador: Compartir, y elige Ludok Home.">
          <Button title="Pegar un enlace" kind="primary" onPress={() => setForm({ open: true })} />
        </Empty>
      ) : (
        <>
          <View style={styles.filters}>
            <Chips options={STATES} value={state} onChange={setState} />
            {counts.length > 0 ? <Chips options={tagOptions} value={tag} onChange={setTag} /> : null}
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {shown.length === 0 ? (
              <Txt variant="small" tone="muted" style={styles.center}>
                {state === 'hechos' ? 'Todavía no has marcado nada como hecho.' : 'Nada pendiente con esta etiqueta.'}
              </Txt>
            ) : (
              shown.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => Linking.openURL(l.url)}
                  onLongPress={() => setForm({ open: true, link: l })}
                  accessibilityHint="Abre el enlace. Mantén pulsado para editar."
                  style={({ pressed }) => [styles.card, { backgroundColor: palette.surface, borderColor: palette.line, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Thumb imageUrl={l.imageUrl} label={l.title ?? hostOf(l.url)} size={64} />
                  <View style={styles.text}>
                    <Txt variant="body" numberOfLines={2} tone={l.done ? 'muted' : 'fg'}>
                      {l.title ?? hostOf(l.url)}
                    </Txt>
                    <Txt variant="data" tone="faint" numberOfLines={1}>
                      {l.kind === 'video' ? 'Vídeo' : 'Web'} · {hostOf(l.url)}
                    </Txt>
                    {l.tags.length ? (
                      <View style={styles.tags}>
                        {l.tags.map((t) => (
                          <View key={t} style={[styles.tag, { borderColor: palette.line }]}>
                            <Txt variant="data" tone="muted">
                              {t}
                            </Txt>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {l.note ? (
                      <Txt variant="small" tone="muted" numberOfLines={2}>
                        {l.note}
                      </Txt>
                    ) : null}
                  </View>
                  <Tick on={l.done} onPress={() => markDone(l)} label={l.done ? 'Volver a pendiente' : 'Marcar como hecho'} />
                </Pressable>
              ))
            )}
            <Txt variant="small" tone="faint" style={styles.center}>
              Toca para abrir, mantén pulsado para editar.
            </Txt>
          </ScrollView>
        </>
      )}
      <SavedForm
        visible={form.open}
        link={form.link}
        knownTags={counts.map((c) => c.tag)}
        onClose={() => setForm({ open: false })}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  filters: { gap: space.sm, paddingBottom: space.md },
  list: { gap: space.sm, paddingBottom: space.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.sm,
  },
  text: { flex: 1, gap: 3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 1 },
  center: { textAlign: 'center', marginTop: space.md },
})
