import { useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { Field } from '../ui/Field'
import { Chips } from '../ui/Chips'
import { Button } from '../ui/Button'
import { Txt } from '../ui/Text'
import { Tick } from '../ui/Tick'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { space } from '../ui/theme'
import { addNote, deleteNote, notesForToday, notesInMind, setNoteDone, updateNote } from '../lib/notes'
import { shortDate } from '../lib/format'
import type { DayString, QuickNote } from '../types'

const WHEN = [
  { key: 'hoy' as const, label: 'Para hoy' },
  { key: 'mente' as const, label: 'En mente' },
]

/**
 * Apuntar algo en dos segundos: lo que se te acaba de ocurrir y tienes que
 * hacer hoy, o algo para no olvidarlo. Va arriba en Hoy porque es lo que se
 * abre con prisa.
 */
export function QuickNotes({ notes, day }: { notes: QuickNote[]; day: DayString }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [when, setWhen] = useState<'hoy' | 'mente'>('hoy')
  const [showMind, setShowMind] = useState(false)
  const [editing, setEditing] = useState<QuickNote | null>(null)

  const today = notesForToday(notes, day)
  const mind = notesInMind(notes)

  const add = async () => {
    if (!text.trim()) return
    try {
      await addNote(text, when === 'hoy' ? day : undefined)
      setText('')
      if (when === 'mente') {
        setShowMind(true)
        toast('Apuntada en «en mente»')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const done = async (n: QuickNote) => {
    await setNoteDone(n.id, true)
    toast('Hecha')
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.addRow}>
        <Field
          value={text}
          onChangeText={setText}
          placeholder="Apuntar algo…"
          onSubmitEditing={add}
          returnKeyType="done"
          submitBehavior="submit"
          autoCapitalize="sentences"
        />
        <Button title="Apuntar" kind="primary" onPress={add} disabled={!text.trim()} />
      </View>
      <Chips options={WHEN} value={when} onChange={setWhen} />

      {today.length > 0 ? (
        <View style={styles.list}>
          {today.map((n) => (
            <NoteRow key={n.id} note={n} day={day} onDone={() => done(n)} onEdit={() => setEditing(n)} />
          ))}
        </View>
      ) : null}

      {mind.length > 0 ? (
        <Pressable onPress={() => setShowMind(!showMind)} accessibilityRole="button" hitSlop={6}>
          <Txt variant="small" tone="muted" style={styles.bold}>
            {showMind ? 'Ocultar' : 'Ver'} en mente ({mind.length})
          </Txt>
        </Pressable>
      ) : null}
      {showMind && mind.length > 0 ? (
        <View style={styles.list}>
          {mind.map((n) => (
            <NoteRow key={n.id} note={n} day={day} onDone={() => done(n)} onEdit={() => setEditing(n)} />
          ))}
        </View>
      ) : null}

      <EditNote note={editing} day={day} onClose={() => setEditing(null)} />
    </View>
  )
}

function NoteRow({ note, day, onDone, onEdit }: { note: QuickNote; day: DayString; onDone: () => void; onEdit: () => void }) {
  const late = note.forDay !== undefined && note.forDay < day
  return (
    <View style={styles.row}>
      <Tick on={false} onPress={onDone} label={`Marcar hecha: ${note.text}`} />
      <Pressable style={styles.text} onPress={onEdit} accessibilityHint="Editar o borrar">
        <Txt variant="body">{note.text}</Txt>
        {late ? (
          <Txt variant="data" tone="warn">
            Pendiente desde {shortDate(note.forDay!, day)}
          </Txt>
        ) : null}
      </Pressable>
    </View>
  )
}

function EditNote({ note, day, onClose }: { note: QuickNote | null; day: DayString; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [when, setWhen] = useState<'hoy' | 'mente'>('hoy')
  const [shownFor, setShownFor] = useState<string | null>(null)

  // Rellenar al abrir otra nota (sin efecto: el estado se pone aquí mismo).
  if (note && shownFor !== note.id) {
    setShownFor(note.id)
    setText(note.text)
    setWhen(note.forDay ? 'hoy' : 'mente')
  }

  const close = () => {
    setShownFor(null)
    onClose()
  }

  const save = async () => {
    if (!note) return
    try {
      // Pasar una de «en mente» a hoy la apunta para HOY, no para el día en que se creó.
      const forDay = when === 'hoy' ? (note.forDay ?? day) : undefined
      await updateNote(note.id, { text, forDay })
      close()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const remove = () => {
    if (!note) return
    Alert.alert('Borrar nota', note.text, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(note.id)
          close()
        },
      },
    ])
  }

  return (
    <Sheet visible={!!note} title="Nota" onClose={close}>
      <Field value={text} onChangeText={setText} multiline autoCapitalize="sentences" />
      <Chips options={WHEN} value={when} onChange={setWhen} />
      <View style={styles.actions}>
        <Button title="Guardar" kind="primary" onPress={save} style={styles.grow} />
        <Button title="Borrar" kind="danger" onPress={remove} />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  list: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: 2 },
  bold: { fontWeight: '600' },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  grow: { flex: 1 },
})
