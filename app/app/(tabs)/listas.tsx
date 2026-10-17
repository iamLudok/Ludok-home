import { useMemo, useRef, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, View, type TextInput } from 'react-native'
import { Screen, Empty } from '../../src/ui/Screen'
import { Chips } from '../../src/ui/Chips'
import { Field } from '../../src/ui/Field'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Tick } from '../../src/ui/Tick'
import { Thumb } from '../../src/ui/Thumb'
import { Sheet } from '../../src/ui/Sheet'
import { SectionTitle } from '../../src/ui/Card'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { radius, space } from '../../src/ui/theme'
import { ItemForm } from '../../src/components/ItemForm'
import { useList } from '../../src/hooks/useData'
import { addItem, clearAll, clearDone, giftsByPerson, LIST_LABEL, removeItem, setDone, shareText, updateItem } from '../../src/lib/lists'
import { deletePhoto } from '../../src/lib/photos'
import { hostOf } from '../../src/lib/linkPreview'
import type { ListItem, ListKind } from '../../src/types'

const OPTIONS = (['compra', 'wishlist', 'regalos'] as const).map((k) => ({ key: k, label: LIST_LABEL[k] }))

const EMPTY: Record<ListKind, string> = {
  compra: 'La lista de la compra está vacía.',
  wishlist: 'Nada en la wishlist. Apunta lo que te gustaría comprarte, con su enlace.',
  regalos: 'Sin ideas de regalo. Apúntalas aquí cuando se te ocurran, con para quién.',
}

const DONE_LABEL: Record<ListKind, string> = { compra: 'comprados', wishlist: 'conseguidos', regalos: 'regalados' }

export default function Listas() {
  const [list, setList] = useState<ListKind>('compra')
  return (
    <Screen title="Listas">
      <View style={styles.top}>
        <Chips options={OPTIONS} value={list} onChange={setList} />
      </View>
      {list === 'compra' ? <Compra /> : <WithPictures list={list} />}
    </Screen>
  )
}

/* --- Compra: apuntar rápido, compartir por WhatsApp, vaciar --------------- */

function Compra() {
  const palette = usePalette()
  const toast = useToast()
  const { data: items, ready } = useList('compra')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<ListItem | null>(null)
  const nameRef = useRef<TextInput>(null)
  const doneCount = items.filter((i) => i.done).length

  const add = async () => {
    if (!name.trim()) return
    try {
      if (!(await addItem('compra', name))) toast('Ya estaba en la lista')
      setName('')
      // Se apuntan varias cosas seguidas: el teclado se queda abierto.
      nameRef.current?.focus()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo añadir')
    }
  }

  const share = async () => {
    const message = shareText(items)
    if (!message) {
      toast('No queda nada por comprar')
      return
    }
    // El menú de compartir del sistema: WhatsApp, Telegram, SMS… lo que tengas.
    await Share.share({ message })
  }

  const clearEverything = () => {
    Alert.alert('Vaciar la lista', `Se borran los ${items.length} artículos, comprados o no.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Vaciar', style: 'destructive', onPress: () => clearAll('compra') },
    ])
  }

  return (
    <>
      <View style={styles.addRow}>
        <Field
          ref={nameRef}
          value={name}
          onChangeText={setName}
          placeholder="Añadir a la compra"
          returnKeyType="done"
          onSubmitEditing={add}
          submitBehavior="submit"
          autoCapitalize="sentences"
        />
        <Button title="Añadir" kind="primary" onPress={add} disabled={!name.trim()} />
      </View>
      {!ready ? null : items.length === 0 ? (
        <Empty text={EMPTY.compra} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <View style={styles.toolbar}>
            <Button title="Compartir" small onPress={share} />
            {doneCount > 0 ? <Button title={`Quitar comprados (${doneCount})`} kind="ghost" small onPress={() => clearDone('compra')} /> : null}
            <Button title="Vaciar lista" kind="danger" small onPress={clearEverything} />
          </View>
          {items.map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <View style={[styles.sep, { backgroundColor: palette.line }]} /> : null}
              <View style={styles.item}>
                <Tick on={item.done} onPress={() => setDone(item.id, !item.done)} label={item.done ? `Desmarcar ${item.name}` : `Marcar ${item.name}`} />
                <Pressable style={styles.itemText} onLongPress={() => setEditing(item)} onPress={() => setEditing(item)} accessibilityHint="Editar">
                  <Txt variant="body" tone={item.done ? 'muted' : 'fg'} style={item.done ? styles.done : undefined}>
                    {item.name}
                  </Txt>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      <EditCompra item={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function EditCompra({ item, onClose }: { item: ListItem | null; onClose: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [shownFor, setShownFor] = useState<string | null>(null)
  if (item && shownFor !== item.id) {
    setShownFor(item.id)
    setName(item.name)
  }
  const close = () => {
    setShownFor(null)
    onClose()
  }
  return (
    <Sheet visible={!!item} title="Editar" onClose={close}>
      <Field label="Artículo" value={name} onChangeText={setName} autoCapitalize="sentences" />
      <View style={styles.actions}>
        <Button
          title="Guardar"
          kind="primary"
          style={styles.grow}
          onPress={async () => {
            try {
              await updateItem(item!.id, { name })
              close()
            } catch (e) {
              toast(e instanceof Error ? e.message : 'No se pudo guardar')
            }
          }}
        />
        <Button
          title="Quitar"
          kind="danger"
          onPress={async () => {
            await removeItem(item!.id)
            close()
          }}
        />
      </View>
    </Sheet>
  )
}

/* --- Wishlist y regalos: con imagen y, en regalos, para quién ------------- */

function WithPictures({ list }: { list: 'wishlist' | 'regalos' }) {
  const palette = usePalette()
  const { data: items, ready } = useList(list)
  const [form, setForm] = useState<{ open: boolean; item?: ListItem }>({ open: false })
  const doneCount = items.filter((i) => i.done).length

  const groups = useMemo(
    () => (list === 'regalos' ? giftsByPerson(items) : [{ person: '', items }]),
    [list, items],
  )
  const people = useMemo(() => giftsByPerson(items).map((g) => g.person), [items])

  const clear = () => {
    Alert.alert(`Quitar los ${DONE_LABEL[list]}`, `Se borran ${doneCount} de la lista.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => (await clearDone(list)).forEach(deletePhoto) },
    ])
  }

  return (
    <>
      <View style={styles.addRow}>
        <Button title={list === 'regalos' ? 'Nueva idea de regalo' : 'Añadir a la wishlist'} kind="primary" onPress={() => setForm({ open: true })} style={styles.grow} />
      </View>
      {!ready ? null : items.length === 0 ? (
        <Empty text={EMPTY[list]} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {groups.map((g) => (
            <View key={g.person || 'todos'} style={styles.group}>
              {g.person ? <SectionTitle title={g.person} /> : null}
              {g.items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => (item.url ? Linking.openURL(item.url) : setForm({ open: true, item }))}
                  onLongPress={() => setForm({ open: true, item })}
                  accessibilityHint={item.url ? 'Abre el enlace. Mantén pulsado para editar.' : 'Editar'}
                  style={({ pressed }) => [styles.card, { backgroundColor: palette.surface, borderColor: palette.line, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Thumb photo={item.photo} imageUrl={item.imageUrl} label={item.name} />
                  <View style={styles.itemText}>
                    <Txt variant="body" tone={item.done ? 'muted' : 'fg'} numberOfLines={2} style={item.done ? styles.done : undefined}>
                      {item.name}
                    </Txt>
                    {item.url ? (
                      <Txt variant="data" tone="faint" numberOfLines={1}>
                        {hostOf(item.url)}
                      </Txt>
                    ) : null}
                  </View>
                  <Tick on={item.done} onPress={() => setDone(item.id, !item.done)} label={item.done ? `Desmarcar ${item.name}` : `Marcar ${item.name}`} />
                </Pressable>
              ))}
            </View>
          ))}
          {doneCount > 0 ? <Button title={`Quitar los ${DONE_LABEL[list]} (${doneCount})`} kind="ghost" small onPress={clear} style={styles.center} /> : null}
          <Txt variant="small" tone="faint" style={styles.center}>
            Toca para abrir el enlace, mantén pulsado para editar.
          </Txt>
        </ScrollView>
      )}
      <ItemForm visible={form.open} list={list} item={form.item} people={people} onClose={() => setForm({ open: false })} />
    </>
  )
}

const styles = StyleSheet.create({
  top: { paddingBottom: space.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.md },
  list: { paddingBottom: space.xxl, gap: space.sm },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingBottom: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  itemText: { flex: 1, gap: 2 },
  done: { textDecorationLine: 'line-through' },
  sep: { height: StyleSheet.hairlineWidth },
  group: { gap: space.sm, marginBottom: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.sm,
  },
  center: { alignSelf: 'center', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  grow: { flex: 1 },
})
