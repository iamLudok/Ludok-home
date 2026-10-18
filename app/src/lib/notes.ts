// Notas rápidas: lo que se te acaba de ocurrir, para hoy o para tener en mente.
import { desc, eq } from 'drizzle-orm'
import { getDb } from './dbRef'
import { quickNotes as notesTable } from './schema'
import { quickNoteToRow, rowToQuickNote } from './rows'
import { patchToColumns } from './sqlHelpers'
import { newId } from './ids'
import type { DayString, QuickNote } from '../types'

/**
 * Las de hoy: las apuntadas para hoy y las de días anteriores que siguen sin
 * hacer. Una nota «para hoy» que no hiciste no desaparece a medianoche: era
 * justo lo que no se te podía olvidar. Las más viejas primero.
 */
export function notesForToday(notes: QuickNote[], todayDay: DayString): QuickNote[] {
  return notes
    .filter((n) => !n.done && n.forDay !== undefined && n.forDay <= todayDay)
    .sort((a, b) => (a.forDay! < b.forDay! ? -1 : a.forDay! > b.forDay! ? 1 : a.createdAt - b.createdAt))
}

/** Las de tener en mente (sin fecha), las más nuevas primero. */
export function notesInMind(notes: QuickNote[]): QuickNote[] {
  return notes.filter((n) => !n.done && n.forDay === undefined).sort((a, b) => b.createdAt - a.createdAt)
}

export async function addNote(text: string, forDay?: DayString): Promise<QuickNote> {
  const clean = text.trim()
  if (!clean) throw new Error('La nota está vacía.')
  const note: QuickNote = { id: newId(), text: clean, forDay, done: false, createdAt: Date.now() }
  await getDb().insert(notesTable).values(quickNoteToRow(note))
  return note
}

export async function setNoteDone(id: string, done: boolean): Promise<void> {
  await getDb()
    .update(notesTable)
    .set({ done, doneAt: done ? Date.now() : null })
    .where(eq(notesTable.id, id))
}

export async function updateNote(id: string, patch: { text?: string; forDay?: DayString }): Promise<void> {
  if (patch.text !== undefined && !patch.text.trim()) throw new Error('La nota está vacía.')
  const cols = patchToColumns(patch)
  if (patch.text !== undefined) cols.text = patch.text.trim()
  await getDb().update(notesTable).set(cols).where(eq(notesTable.id, id))
}

export async function deleteNote(id: string): Promise<void> {
  await getDb().delete(notesTable).where(eq(notesTable.id, id))
}

export async function listNotes(): Promise<QuickNote[]> {
  const rows = await getDb().select().from(notesTable).orderBy(desc(notesTable.createdAt))
  return rows.map(rowToQuickNote)
}
