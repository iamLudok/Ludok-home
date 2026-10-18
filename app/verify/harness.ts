/**
 * Andamiaje común de los scripts de `verify/`.
 *
 * La idea: ejecutar el MISMO código que corre en el móvil contra un SQLite de
 * escritorio, gracias a que la lógica pide la base a `dbRef` en vez de crearla.
 */

// libsql y no better-sqlite3: better-sqlite3 es sincrónico y no admite
// transacciones asíncronas, mientras expo-sqlite (el del móvil) sí. Con libsql
// la semántica async coincide con la real y se ejecuta el mismo código.
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import * as schema from '../src/lib/schema'
// Importado, NO copiado: si el script declarase su propio DDL, validaría un
// esquema que no es el que crea la app.
import { CREATE_SQL } from '../src/lib/schemaSql'
import { setDb } from '../src/lib/dbRef'
import type { LudokDb } from '../src/lib/backupCore'

/* --- Comprobaciones: sin framework, un contador y process.exit ----------- */

let failures = 0

export function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FALLO'} ${label}${detail ? ': ' + detail : ''}`)
  if (!ok) failures++
}

export function eq<T>(label: string, actual: T, expected: T): void {
  check(label, actual === expected, actual === expected ? '' : `esperado ${expected}, salió ${actual}`)
}

export function finish(titulo: string): never {
  cleanupTempFiles()
  console.log(failures === 0 ? `\n✔ ${titulo}: todo correcto` : `\n✘ ${titulo}: ${failures} fallo(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

/* --- Base de datos de usar y tirar --------------------------------------- */

// Fichero temporal en vez de ':memory:': una base en memoria NO se comparte
// entre conexiones, y las transacciones abren la suya, así que las tablas
// desaparecían dentro de la transacción. Con fichero se comporta como en el
// móvil, que también usa un fichero.
const tempFiles: string[] = []
let dbSeq = 0

export async function freshDb(): Promise<LudokDb> {
  const path = join(tmpdir(), `ludok-home-verify-${process.pid}-${dbSeq++}.db`)
  rmSync(path, { force: true })
  tempFiles.push(path)
  const client = createClient({ url: `file:${path}` })
  await client.executeMultiple(CREATE_SQL)
  return drizzle(client, { schema }) as unknown as LudokDb
}

/** Igual que `freshDb`, pero además la registra para que la use la lógica real. */
export async function freshDbAsCurrent(): Promise<LudokDb> {
  const database = await freshDb()
  setDb(database)
  return database
}

export function cleanupTempFiles(): void {
  for (const f of tempFiles) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(f + suffix, { force: true })
  }
}
