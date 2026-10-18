// Definición de tablas para Drizzle. Solo describe las columnas: las tablas y
// los índices se crean con SQL explícito (`schemaSql.ts`), con migraciones por
// PRAGMA user_version.
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import type { CarExpenseKind, ListKind, SavedKind } from '../types'

export const carExpenses = sqliteTable('car_expenses', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  kind: text('kind').$type<CarExpenseKind>().notNull(),
  totalCents: integer('totalCents').notNull(),
  liters: real('liters'),
  pricePerLiter: real('pricePerLiter'),
  description: text('description'),
  odometerKm: integer('odometerKm'),
  createdAt: integer('createdAt').notNull(),
})

export const medicines = sqliteTable('medicines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  everyDays: integer('everyDays').notNull(),
  time: text('time').notNull(),
  // Lista de horas como JSON: son dos o tres valores que siempre se leen y se
  // escriben juntos, y una tabla aparte solo añadiría joins.
  reminders: text('reminders').notNull().default('[]'),
  startDate: text('startDate').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('createdAt').notNull(),
})

export const intakes = sqliteTable('intakes', {
  id: text('id').primaryKey(),
  medicineId: text('medicineId').notNull(),
  date: text('date').notNull(),
  takenAt: integer('takenAt').notNull(),
})

export const listItems = sqliteTable('list_items', {
  id: text('id').primaryKey(),
  list: text('list').$type<ListKind>().notNull(),
  name: text('name').notNull(),
  url: text('url'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  doneAt: integer('doneAt'),
  createdAt: integer('createdAt').notNull(),
  forWhom: text('forWhom'),
  imageUrl: text('imageUrl'),
  photo: text('photo'),
})

export const quickNotes = sqliteTable('quick_notes', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  forDay: text('forDay'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  doneAt: integer('doneAt'),
  createdAt: integer('createdAt').notNull(),
})

export const savedLinks = sqliteTable('saved_links', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  title: text('title'),
  kind: text('kind').$type<SavedKind>().notNull(),
  // Etiquetas como JSON, igual que los avisos de las medicinas: pocas, y se
  // leen siempre con su enlace. Filtrar por etiqueta se hace en memoria.
  tags: text('tags').notNull().default('[]'),
  imageUrl: text('imageUrl'),
  note: text('note'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  doneAt: integer('doneAt'),
  createdAt: integer('createdAt').notNull(),
})

export const deviceNames = sqliteTable('device_names', {
  mac: text('mac').primaryKey(),
  name: text('name').notNull(),
})

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  theme: text('theme').$type<'dark' | 'light' | 'system'>().notNull().default('system'),
  lastBackup: integer('lastBackup').notNull().default(0),
  onboardedAt: integer('onboardedAt'),
  nextcloudUrl: text('nextcloudUrl'),
  nextcloudUser: text('nextcloudUser'),
  nextcloudPassword: text('nextcloudPassword'),
  nextcloudFolder: text('nextcloudFolder'),
  autoBackup: integer('autoBackup', { mode: 'boolean' }),
  lastAutoBackupAt: integer('lastAutoBackupAt'),
  notesImportedAt: integer('notesImportedAt'),
  dockerUrl: text('dockerUrl'),
  dockerLanUrl: text('dockerLanUrl'),
  newsReminder: text('newsReminder'),
  dockerUser: text('dockerUser'),
  dockerPassword: text('dockerPassword'),
  schemaVersion: integer('schemaVersion').notNull(),
})

/**
 * Lo último que se trajo de Nextcloud (tareas y eventos de hoy) para enseñarlo
 * sin conexión. No va en las copias: se vuelve a pedir en cuanto hay red, y
 * guardarlo ahí solo haría crecer el fichero con datos que no son tuyos de la app.
 */
export const cache = sqliteTable('cache', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  fetchedAt: integer('fetchedAt').notNull(),
})

export type CarExpenseRow = typeof carExpenses.$inferSelect
export type MedicineRow = typeof medicines.$inferSelect
export type IntakeRow = typeof intakes.$inferSelect
export type ListItemRow = typeof listItems.$inferSelect
export type SettingsRow = typeof settings.$inferSelect
export type QuickNoteRow = typeof quickNotes.$inferSelect
export type SavedLinkRow = typeof savedLinks.$inferSelect
