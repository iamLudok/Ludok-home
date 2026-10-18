// Importación única de los datos del bot: descarga las notas y se las pasa a
// `notesImportCore`, que es la parte probada en `verify/import.ts`.
import { db } from './db'
import { getSettings } from './settings'
import { configFrom, fetchNotes } from './nextcloud'
import { applyNotesImport, NOTE_TITLES, type NotesImportResult } from './notesImportCore'

export type { NotesImportResult }

export async function importFromBotNotes(): Promise<NotesImportResult> {
  const config = configFrom(await getSettings())
  if (!config) throw new Error('Configura antes Nextcloud en Ajustes.')
  const wanted = new Set<string>(Object.values(NOTE_TITLES))
  // Se queda solo con las seis notas del bot: el resto de tus notas no tienen
  // por qué pasar por la app.
  const notes = (await fetchNotes(config)).filter((n) => wanted.has(n.title))
  if (notes.length === 0) throw new Error('No encuentro ninguna nota del bot en tu Nextcloud.')
  return applyNotesImport(db, notes)
}
