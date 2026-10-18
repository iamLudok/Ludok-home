// Núcleo de las copias de seguridad: solo consultas Drizzle, sin nada nativo.
//
// Está separado de `backup.ts` a propósito. Aquí no se importa expo-file-system
// ni expo-sqlite, así que este código se puede ejecutar tal cual en Node contra
// un SQLite de escritorio para probarlo. Como recibe la base de datos por
// parámetro, el test ejecuta EXACTAMENTE el mismo código que corre en el móvil,
// que es lo único que hace que la prueba valga para algo.
import { eq, sql } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import {
  carExpenses as carTable,
  medicines as medicinesTable,
  intakes as intakesTable,
  listItems as listTable,
  quickNotes as notesTable,
  savedLinks as savedTable,
  deviceNames as deviceNamesTable,
  settings as settingsTable,
} from './schema'
import {
  rowToCarExpense,
  rowToMedicine,
  rowToIntake,
  rowToListItem,
  rowToSettings,
  rowToQuickNote,
  rowToSavedLink,
  quickNoteToRow,
  savedLinkToRow,
  carExpenseToRow,
  medicineToRow,
  intakeToRow,
  listItemToRow,
  settingsToRow,
} from './rows'
import { chunk, excludedSet } from './sqlHelpers'
import { SCHEMA_VERSION } from './version'
import type { BackupFile, BackupPhoto, Settings } from '../types'

export { SCHEMA_VERSION }

/** Cualquier base de datos SQLite de Drizzle (expo-sqlite en el móvil, libsql en los tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LudokDb = BaseSQLiteDatabase<any, any, any>

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  theme: 'system',
  lastBackup: 0,
  schemaVersion: SCHEMA_VERSION,
}

export async function readSettings(database: LudokDb): Promise<Settings> {
  const rows = await database
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, 'app'))
    .limit(1)
  // Se reutiliza `rowToSettings` en vez de repetir aquí el mapeo: tenerlo dos
  // veces es la forma de que un campo nuevo se lea en un sitio y en el otro no.
  return rows[0] ? rowToSettings(rows[0]) : DEFAULT_SETTINGS
}

export async function writeSettings(database: LudokDb, next: Settings): Promise<void> {
  const row = settingsToRow(next)
  await database
    .insert(settingsTable)
    .values(row)
    .onConflictDoUpdate({ target: settingsTable.id, set: row })
}

/**
 * Serializa toda la base de datos a un objeto de copia.
 *
 * Las fotos propias de las listas NO las mete esta función: viven en ficheros,
 * y leerlos es nativo. Las añade `backup.ts` en el móvil, en `photos`.
 */
export async function exportAll(database: LudokDb): Promise<BackupFile> {
  const car = await database.select().from(carTable)
  const meds = await database.select().from(medicinesTable)
  const taken = await database.select().from(intakesTable)
  const items = await database.select().from(listTable)
  const notes = await database.select().from(notesTable)
  const saved = await database.select().from(savedTable)
  const names = await database.select().from(deviceNamesTable)
  const appSettings = await readSettings(database)

  // La contraseña de Nextcloud NO se exporta. Una copia se comparte y se mueve
  // de sitio, y esa contraseña da permiso de ESCRITURA sobre tus ficheros; la
  // propia copia acaba subida ahí, así que además viajaría con su propia llave
  // dentro. Al restaurar en otro móvil hay que volver a escribirla, y punto.
  // Por lo mismo, tampoco la de Docker: esa además da control total de la Pi.
  const { nextcloudPassword: _omitted, dockerPassword: _omittedDocker, ...safeSettings } = appSettings

  return {
    app: 'ludok-home',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    carExpenses: car.map(rowToCarExpense),
    medicines: meds.map(rowToMedicine),
    intakes: taken.map(rowToIntake),
    listItems: items.map(rowToListItem),
    notes: notes.map(rowToQuickNote),
    saved: saved.map(rowToSavedLink),
    deviceNames: names.map((n) => ({ mac: n.mac, name: n.name })),
    settings: safeSettings,
  }
}

export interface ImportResult {
  carExpenses: number
  medicines: number
  intakes: number
  listItems: number
  notes: number
  saved: number
  deviceNames: number
  /** Tomas que apuntaban a una medicina que no viene en la copia. */
  discardedIntakes: number
  /** Las fotos que traía la copia, para que `backup.ts` las escriba a fichero. */
  photos: BackupPhoto[]
}

/**
 * Importa una copia. 'replace' vacía antes lo que haya; 'merge' añade/actualiza
 * por id sin borrar nada. Todo dentro de una transacción: si algo falla a mitad
 * no se queda la base de datos a medias.
 */
export async function importBackup(
  database: LudokDb,
  raw: string,
  mode: 'replace' | 'merge' = 'replace',
): Promise<ImportResult> {
  let parsed: BackupFile
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('El fichero no es un JSON válido.')
  }
  if (parsed?.app !== 'ludok-home' || !Array.isArray(parsed.medicines)) {
    throw new Error('Esto no parece una copia de Ludok Home.')
  }
  if (parsed.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `La copia es de una versión más nueva (v${parsed.schemaVersion}). Actualiza la app antes de importar.`,
    )
  }

  const incomingCar = parsed.carExpenses ?? []
  const incomingMeds = parsed.medicines ?? []
  const incomingItems = parsed.listItems ?? []
  // Ausentes en las copias de la v1: se tratan como listas vacías.
  const incomingNotes = parsed.notes ?? []
  const incomingSaved = parsed.saved ?? []
  const incomingNames = (parsed.deviceNames ?? []).filter((d) => d?.mac && d?.name)

  // Una toma sin su medicina no se puede enseñar en ningún sitio (el gráfico
  // va por medicina) y quedaría como fila fantasma para siempre. En 'merge' la
  // medicina puede estar ya en este móvil, así que se busca también ahí.
  const knownMeds = new Set(incomingMeds.map((m) => m.id))
  if (mode === 'merge') {
    for (const m of await database.select({ id: medicinesTable.id }).from(medicinesTable)) {
      knownMeds.add(m.id)
    }
  }
  const allIntakes = parsed.intakes ?? []
  const incomingIntakes = allIntakes.filter((i) => knownMeds.has(i.medicineId))

  await database.transaction(async (tx: LudokDb) => {
    if (mode === 'replace') {
      await tx.delete(intakesTable)
      await tx.delete(medicinesTable)
      await tx.delete(carTable)
      await tx.delete(listTable)
      await tx.delete(notesTable)
      await tx.delete(savedTable)
      await tx.delete(deviceNamesTable)
    }
    for (const part of chunk(incomingCar)) {
      await tx
        .insert(carTable)
        .values(part.map(carExpenseToRow))
        .onConflictDoUpdate({ target: carTable.id, set: excludedSet(carTable) })
    }
    for (const part of chunk(incomingMeds)) {
      await tx
        .insert(medicinesTable)
        .values(part.map(medicineToRow))
        .onConflictDoUpdate({ target: medicinesTable.id, set: excludedSet(medicinesTable) })
    }
    for (const part of chunk(incomingIntakes)) {
      // `onConflictDoNothing` sin columna cubre los dos choques posibles: mismo
      // id, o la misma medicina el mismo día con otro id (índice único). En el
      // segundo caso la toma ya está apuntada y no hay nada que actualizar.
      await tx.insert(intakesTable).values(part.map(intakeToRow)).onConflictDoNothing()
    }
    for (const part of chunk(incomingItems)) {
      await tx
        .insert(listTable)
        .values(part.map(listItemToRow))
        .onConflictDoUpdate({ target: listTable.id, set: excludedSet(listTable) })
    }
    for (const part of chunk(incomingNotes)) {
      await tx
        .insert(notesTable)
        .values(part.map(quickNoteToRow))
        .onConflictDoUpdate({ target: notesTable.id, set: excludedSet(notesTable) })
    }
    for (const part of chunk(incomingSaved)) {
      await tx
        .insert(savedTable)
        .values(part.map(savedLinkToRow))
        .onConflictDoUpdate({ target: savedTable.id, set: excludedSet(savedTable) })
    }
    for (const part of chunk(incomingNames)) {
      await tx
        .insert(deviceNamesTable)
        .values(part.map((d) => ({ mac: d.mac.toLowerCase(), name: d.name })))
        .onConflictDoUpdate({ target: deviceNamesTable.mac, set: { name: sql`excluded.name` } })
    }
  })

  // Las preferencias se restauran, pero se conserva la schemaVersion actual. La
  // contraseña de Nextcloud no viene en la copia, así que se mantiene la que ya
  // hubiera en este móvil.
  if (parsed.settings) {
    const current = await readSettings(database)
    await writeSettings(database, {
      ...current,
      theme: parsed.settings.theme || current.theme,
      nextcloudUrl: parsed.settings.nextcloudUrl || current.nextcloudUrl,
      nextcloudUser: parsed.settings.nextcloudUser || current.nextcloudUser,
      nextcloudFolder: parsed.settings.nextcloudFolder || current.nextcloudFolder,
      autoBackup: parsed.settings.autoBackup ?? current.autoBackup,
      notesImportedAt: parsed.settings.notesImportedAt ?? current.notesImportedAt,
      dockerUrl: parsed.settings.dockerUrl || current.dockerUrl,
      dockerLanUrl: parsed.settings.dockerLanUrl || current.dockerLanUrl,
      newsReminder: parsed.settings.newsReminder || current.newsReminder,
      dockerUser: parsed.settings.dockerUser || current.dockerUser,
      contractDownMbps: parsed.settings.contractDownMbps || current.contractDownMbps,
      contractUpMbps: parsed.settings.contractUpMbps || current.contractUpMbps,
      // La ciudad va entera o no va: un nombre con las coordenadas de otra
      // daría el tiempo de un sitio con el nombre de otro.
      ...(parsed.settings.weatherPlace && parsed.settings.weatherLat != null && parsed.settings.weatherLon != null
        ? { weatherPlace: parsed.settings.weatherPlace, weatherLat: parsed.settings.weatherLat, weatherLon: parsed.settings.weatherLon }
        : {}),
      id: 'app',
    })
  }

  return {
    carExpenses: incomingCar.length,
    medicines: incomingMeds.length,
    intakes: incomingIntakes.length,
    listItems: incomingItems.length,
    notes: incomingNotes.length,
    saved: incomingSaved.length,
    deviceNames: incomingNames.length,
    discardedIntakes: allIntakes.length - incomingIntakes.length,
    photos: Array.isArray(parsed.photos) ? parsed.photos : [],
  }
}

/** Días transcurridos desde la última copia. Infinity si nunca se ha hecho. */
export function daysSinceBackup(lastBackup: number): number {
  if (!lastBackup) return Infinity
  return Math.floor((Date.now() - lastBackup) / 86_400_000)
}
