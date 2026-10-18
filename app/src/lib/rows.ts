// Traducción entre las filas de SQLite y el modelo de dominio.
//
// SQLite devuelve `null` en las columnas vacías, pero los tipos de la app (y el
// formato de las copias) usan `undefined`, que `JSON.stringify` elimina. Pasar
// de uno a otro explícitamente es lo que mantiene los ficheros de copia con la
// misma forma exacta siempre.
import { SCHEMA_VERSION } from './version'
import type {
  carExpenses,
  medicines,
  intakes,
  listItems,
  quickNotes,
  savedLinks,
  settings,
  QuickNoteRow,
  SavedLinkRow,
  CarExpenseRow,
  MedicineRow,
  IntakeRow,
  ListItemRow,
  SettingsRow,
} from './schema'
import type { CarExpense, Medicine, MedicineIntake, ListItem, QuickNote, SavedLink, Settings } from '../types'

type CarExpenseInsert = typeof carExpenses.$inferInsert
type MedicineInsert = typeof medicines.$inferInsert
type IntakeInsert = typeof intakes.$inferInsert
type ListItemInsert = typeof listItems.$inferInsert
type SettingsInsert = typeof settings.$inferInsert
type QuickNoteInsert = typeof quickNotes.$inferInsert
type SavedLinkInsert = typeof savedLinks.$inferInsert

/** null → undefined */
const u = <T>(v: T | null): T | undefined => (v === null ? undefined : v)
/** undefined → null */
const n = <T>(v: T | undefined): T | null => (v === undefined ? null : v)

/**
 * Lee una lista de textos guardada como JSON (avisos, etiquetas) sin fiarse del
 * contenido: una columna corrupta no puede tumbar la pantalla de medicinas, que
 * es justo la que no puede fallar.
 */
function parseStringList(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

export function rowToCarExpense(r: CarExpenseRow): CarExpense {
  return {
    id: r.id,
    date: r.date,
    kind: r.kind,
    totalCents: r.totalCents,
    liters: u(r.liters),
    pricePerLiter: u(r.pricePerLiter),
    description: u(r.description),
    odometerKm: u(r.odometerKm),
    createdAt: r.createdAt,
  }
}

export function carExpenseToRow(e: CarExpense): CarExpenseInsert {
  return {
    id: e.id,
    date: e.date,
    kind: e.kind,
    totalCents: e.totalCents,
    liters: n(e.liters),
    pricePerLiter: n(e.pricePerLiter),
    description: n(e.description),
    odometerKm: n(e.odometerKm),
    createdAt: e.createdAt,
  }
}

export function rowToMedicine(r: MedicineRow): Medicine {
  return {
    id: r.id,
    name: r.name,
    everyDays: r.everyDays,
    time: r.time,
    reminders: parseStringList(r.reminders),
    startDate: r.startDate,
    active: r.active,
    createdAt: r.createdAt,
  }
}

export function medicineToRow(m: Medicine): MedicineInsert {
  return {
    id: m.id,
    name: m.name,
    everyDays: m.everyDays,
    time: m.time,
    reminders: JSON.stringify(m.reminders ?? []),
    startDate: m.startDate,
    active: m.active,
    createdAt: m.createdAt,
  }
}

export function rowToIntake(r: IntakeRow): MedicineIntake {
  return { id: r.id, medicineId: r.medicineId, date: r.date, takenAt: r.takenAt }
}

export function intakeToRow(i: MedicineIntake): IntakeInsert {
  return { id: i.id, medicineId: i.medicineId, date: i.date, takenAt: i.takenAt }
}

export function rowToListItem(r: ListItemRow): ListItem {
  return {
    id: r.id,
    list: r.list,
    name: r.name,
    url: u(r.url),
    done: r.done,
    doneAt: u(r.doneAt),
    createdAt: r.createdAt,
    forWhom: u(r.forWhom),
    imageUrl: u(r.imageUrl),
    photo: u(r.photo),
  }
}

export function listItemToRow(i: ListItem): ListItemInsert {
  return {
    id: i.id,
    list: i.list,
    name: i.name,
    url: n(i.url),
    done: i.done,
    doneAt: n(i.doneAt),
    createdAt: i.createdAt,
    forWhom: n(i.forWhom),
    imageUrl: n(i.imageUrl),
    photo: n(i.photo),
  }
}

export function rowToQuickNote(r: QuickNoteRow): QuickNote {
  return { id: r.id, text: r.text, forDay: u(r.forDay), done: r.done, doneAt: u(r.doneAt), createdAt: r.createdAt }
}

export function quickNoteToRow(q: QuickNote): QuickNoteInsert {
  return { id: q.id, text: q.text, forDay: n(q.forDay), done: q.done, doneAt: n(q.doneAt), createdAt: q.createdAt }
}

export function rowToSavedLink(r: SavedLinkRow): SavedLink {
  return {
    id: r.id,
    url: r.url,
    title: u(r.title),
    kind: r.kind,
    tags: parseStringList(r.tags),
    imageUrl: u(r.imageUrl),
    note: u(r.note),
    done: r.done,
    doneAt: u(r.doneAt),
    createdAt: r.createdAt,
  }
}

export function savedLinkToRow(l: SavedLink): SavedLinkInsert {
  return {
    id: l.id,
    url: l.url,
    title: n(l.title),
    kind: l.kind,
    tags: JSON.stringify(l.tags ?? []),
    imageUrl: n(l.imageUrl),
    note: n(l.note),
    done: l.done,
    doneAt: n(l.doneAt),
    createdAt: l.createdAt,
  }
}

export function rowToSettings(r: SettingsRow): Settings {
  return {
    id: 'app',
    theme: r.theme,
    lastBackup: r.lastBackup,
    onboardedAt: u(r.onboardedAt),
    nextcloudUrl: u(r.nextcloudUrl),
    nextcloudUser: u(r.nextcloudUser),
    nextcloudPassword: u(r.nextcloudPassword),
    nextcloudFolder: u(r.nextcloudFolder),
    autoBackup: u(r.autoBackup),
    lastAutoBackupAt: u(r.lastAutoBackupAt),
    notesImportedAt: u(r.notesImportedAt),
    dockerUrl: u(r.dockerUrl),
    dockerLanUrl: u(r.dockerLanUrl),
    newsReminder: u(r.newsReminder),
    dockerUser: u(r.dockerUser),
    dockerPassword: u(r.dockerPassword),
    contractDownMbps: u(r.contractDownMbps),
    contractUpMbps: u(r.contractUpMbps),
    weatherPlace: u(r.weatherPlace),
    weatherLat: u(r.weatherLat),
    weatherLon: u(r.weatherLon),
    schemaVersion: r.schemaVersion,
  }
}

export function settingsToRow(s: Settings): SettingsInsert {
  return {
    id: 'app',
    theme: s.theme,
    lastBackup: s.lastBackup,
    onboardedAt: n(s.onboardedAt),
    nextcloudUrl: n(s.nextcloudUrl),
    nextcloudUser: n(s.nextcloudUser),
    nextcloudPassword: n(s.nextcloudPassword),
    nextcloudFolder: n(s.nextcloudFolder),
    autoBackup: n(s.autoBackup),
    lastAutoBackupAt: n(s.lastAutoBackupAt),
    notesImportedAt: n(s.notesImportedAt),
    dockerUrl: n(s.dockerUrl),
    dockerLanUrl: n(s.dockerLanUrl),
    newsReminder: n(s.newsReminder),
    dockerUser: n(s.dockerUser),
    dockerPassword: n(s.dockerPassword),
    contractDownMbps: n(s.contractDownMbps),
    contractUpMbps: n(s.contractUpMbps),
    weatherPlace: n(s.weatherPlace),
    weatherLat: n(s.weatherLat),
    weatherLon: n(s.weatherLon),
    schemaVersion: s.schemaVersion ?? SCHEMA_VERSION,
  }
}
