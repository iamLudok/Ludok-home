/**
 * Verificación de las migraciones de esquema.
 *
 * Importa porque en cuanto la app esté instalada habrá una base con datos de
 * verdad: si un `ALTER TABLE` falla, la app no arranca, y si un paso olvida una
 * columna, la instalación vieja y la nueva quedan con esquemas distintos.
 *
 * Se crea la base tal y como la deja la v1 (copia CONGELADA de aquel esquema,
 * no importada: tiene que seguir siendo la v1 aunque CREATE_SQL cambie), se le
 * meten datos, se aplican las migraciones como lo hace `db.ts`, y se compara
 * con una instalación nueva.
 */
import { createClient, type Client } from '@libsql/client'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { check, eq, finish } from './harness'
import { CREATE_SQL, MIGRATIONS, DB_VERSION } from '../src/lib/schemaSql'

/** Esquema de la v1 (primera versión publicada). NO TOCAR: es historia. */
const V1_SQL = `
CREATE TABLE IF NOT EXISTS car_expenses (
  id TEXT PRIMARY KEY NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL,
  totalCents INTEGER NOT NULL, liters REAL, pricePerLiter REAL, description TEXT,
  odometerKm INTEGER, createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, everyDays INTEGER NOT NULL,
  time TEXT NOT NULL, reminders TEXT NOT NULL DEFAULT '[]', startDate TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS intakes (
  id TEXT PRIMARY KEY NOT NULL, medicineId TEXT NOT NULL, date TEXT NOT NULL,
  takenAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS list_items (
  id TEXT PRIMARY KEY NOT NULL, list TEXT NOT NULL, name TEXT NOT NULL, url TEXT,
  done INTEGER NOT NULL DEFAULT 0, doneAt INTEGER, createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL, theme TEXT NOT NULL DEFAULT 'system',
  lastBackup INTEGER NOT NULL DEFAULT 0, onboardedAt INTEGER, nextcloudUrl TEXT,
  nextcloudUser TEXT, nextcloudPassword TEXT, nextcloudFolder TEXT, autoBackup INTEGER,
  lastAutoBackupAt INTEGER, notesImportedAt INTEGER, schemaVersion INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, fetchedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS car_expenses_date_idx ON car_expenses (date);
CREATE INDEX IF NOT EXISTS intakes_date_idx ON intakes (date);
CREATE UNIQUE INDEX IF NOT EXISTS intakes_med_date_idx ON intakes (medicineId, date);
CREATE INDEX IF NOT EXISTS list_items_list_idx ON list_items (list);
`

const files: string[] = []
function tmpFile(name: string): string {
  const path = join(tmpdir(), `ludok-home-mig-${process.pid}-${name}.db`)
  for (const s of ['', '-wal', '-shm']) rmSync(path + s, { force: true })
  files.push(path)
  return path
}
function cleanup() {
  for (const f of files) for (const s of ['', '-wal', '-shm']) rmSync(f + s, { force: true })
}

async function userVersion(client: Client): Promise<number> {
  const r = await client.execute('PRAGMA user_version')
  return Number(r.rows[0]?.[0] ?? 0)
}

/** Reproduce exactamente lo que hace `migrateSync()` en `src/lib/db.ts`. */
async function migrate(client: Client): Promise<void> {
  const current = await userVersion(client)
  if (current >= DB_VERSION) return
  await client.executeMultiple(CREATE_SQL)
  if (current > 0) {
    for (const step of MIGRATIONS.slice(current - 1)) await client.executeMultiple(step)
  }
  await client.execute(`PRAGMA user_version = ${DB_VERSION}`)
}

/** Columnas e índices de cada tabla, en una forma comparable. */
async function shape(client: Client): Promise<string> {
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  const out: string[] = []
  for (const row of tables.rows) {
    const name = String(row[0])
    const cols = await client.execute(`PRAGMA table_info(${name})`)
    const desc = cols.rows
      .map((c) => `${c[1]}:${c[2]}:${c[3]}:${c[4] ?? ''}:${c[5]}`)
      .sort()
      .join(',')
    out.push(`${name}(${desc})`)
  }
  const idx = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  out.push('índices:' + idx.rows.map((r) => r[0]).join(','))
  return out.join('\n')
}

async function main() {
  console.log('Instalación nueva')
  const fresh = createClient({ url: `file:${tmpFile('fresh')}` })
  await migrate(fresh)
  eq('queda en la versión actual', await userVersion(fresh), DB_VERSION)
  await migrate(fresh)
  check('abrirla otra vez no hace nada ni falla', (await userVersion(fresh)) === DB_VERSION)

  console.log('\nActualizar desde la v1 con datos')
  const old = createClient({ url: `file:${tmpFile('v1')}` })
  await old.executeMultiple(V1_SQL)
  await old.execute('PRAGMA user_version = 1')
  await old.executeMultiple(`
    INSERT INTO car_expenses (id, date, kind, totalCents, liters, pricePerLiter, createdAt)
      VALUES ('c1', '2026-10-01', 'gasolina', 6636, 40, 1.659, 1);
    INSERT INTO medicines (id, name, everyDays, time, reminders, startDate, active, createdAt)
      VALUES ('m1', 'Elebrato', 1, '08:00', '["09:30"]', '2026-04-10', 1, 1);
    INSERT INTO intakes (id, medicineId, date, takenAt) VALUES ('i1', 'm1', '2026-10-16', 1);
    INSERT INTO list_items (id, list, name, done, createdAt) VALUES ('l1', 'compra', 'Leche', 0, 1);
    INSERT INTO settings (id, theme, lastBackup, nextcloudPassword, schemaVersion)
      VALUES ('app', 'dark', 5, 'secreta', 1);
  `)
  await migrate(old)
  eq('queda en la versión actual', await userVersion(old), DB_VERSION)
  eq('mismo esquema que una instalación nueva', await shape(old), await shape(fresh))

  const count = async (table: string) => Number((await old.execute(`SELECT COUNT(*) FROM ${table}`)).rows[0][0])
  eq('no se pierde ningún gasto', await count('car_expenses'), 1)
  eq('no se pierde ninguna medicina', await count('medicines'), 1)
  eq('no se pierde ninguna toma', await count('intakes'), 1)
  eq('no se pierde ningún elemento de lista', await count('list_items'), 1)
  const leche = await old.execute("SELECT name, forWhom, photo FROM list_items WHERE id = 'l1'")
  eq('el elemento de la v1 conserva su nombre', String(leche.rows[0][0]), 'Leche')
  check('y las columnas nuevas quedan vacías', leche.rows[0][1] === null && leche.rows[0][2] === null)
  eq('existe la tabla de notas', await count('quick_notes'), 0)
  eq('existe la tabla de guardados', await count('saved_links'), 0)
  const dockerCol = await old.execute("SELECT dockerUrl FROM settings WHERE id = 'app'")
  check('los ajustes ganan la conexión con Docker, vacía', dockerCol.rows[0][0] === null)
  const lanCol = await old.execute("SELECT dockerLanUrl FROM settings WHERE id = 'app'")
  check('y la dirección de casa, vacía', lanCol.rows[0][0] === null)
  const newsCol = await old.execute("SELECT newsReminder FROM settings WHERE id = 'app'")
  check('y el aviso de noticias, vacío (que significa «a la hora por defecto»)', newsCol.rows[0][0] === null)
  eq('existe la tabla de nombres de dispositivos', await count('device_names'), 0)
  const pwd = await old.execute("SELECT nextcloudPassword FROM settings WHERE id = 'app'")
  eq('se conserva la contraseña de Nextcloud', String(pwd.rows[0][0]), 'secreta')

  console.log('\nEl índice único de tomas sigue funcionando')
  try {
    await old.execute("INSERT INTO intakes (id, medicineId, date, takenAt) VALUES ('i2', 'm1', '2026-10-16', 2)")
    check('rechaza dos tomas el mismo día', false)
  } catch {
    check('rechaza dos tomas el mismo día', true)
  }

  fresh.close()
  old.close()
  cleanup()
  finish('verify:migration')
}

main().catch((err) => {
  cleanup()
  console.error(err)
  process.exit(1)
})
