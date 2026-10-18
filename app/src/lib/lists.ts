// Listas: compra, wishlist e ideas de regalo, en una sola tabla.
//
// Van juntas porque son lo mismo (un nombre, a veces un enlace, y una marca de
// hecho) y separarlas en tres tablas triplicaría el código de copias e
// importación sin ganar nada.
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from './dbRef'
import { listItems as listTable } from './schema'
import { listItemToRow, rowToListItem } from './rows'
import { newId } from './ids'
import type { ListItem, ListKind } from '../types'

export const LIST_LABEL: Record<ListKind, string> = {
  compra: 'Compra',
  wishlist: 'Wishlist',
  regalos: 'Regalos',
}

/** Quita espacios y mira que un enlace lo parezca. Sin esquema se le pone https://. */
export function cleanUrl(raw: string | undefined): string | undefined {
  const s = raw?.trim()
  if (!s) return undefined
  const withScheme = /^[a-z]+:\/\//i.test(s) ? s : `https://${s}`
  if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(withScheme)) throw new Error('El enlace no parece una dirección web.')
  return withScheme
}

export interface ItemExtras {
  url?: string
  /** Solo regalos. */
  forWhom?: string
  imageUrl?: string
  photo?: string
}

const sameText = (a: string | undefined | null, b: string | undefined | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/**
 * Añade un elemento. Si ya hay uno pendiente con el mismo nombre (sin mirar
 * mayúsculas) no se duplica: apuntar «leche» dos veces en la lista de la compra
 * es siempre un despiste, no dos litros más. En regalos cuenta también para
 * quién: el mismo libro para dos personas son dos regalos.
 */
export async function addItem(list: ListKind, name: string, extras: ItemExtras = {}): Promise<ListItem | null> {
  const clean = name.trim()
  if (!clean) throw new Error('Falta el nombre.')
  const link = cleanUrl(extras.url)
  const forWhom = list === 'regalos' ? extras.forWhom?.trim() || undefined : undefined
  const db = getDb()
  const pending = await db
    .select()
    .from(listTable)
    .where(and(eq(listTable.list, list), eq(listTable.done, false)))
  if (pending.some((r) => sameText(r.name, clean) && sameText(r.forWhom, forWhom))) return null

  const item: ListItem = {
    id: newId(),
    list,
    name: clean,
    url: link,
    forWhom,
    imageUrl: extras.imageUrl,
    photo: extras.photo,
    done: false,
    createdAt: Date.now(),
  }
  await db.insert(listTable).values(listItemToRow(item))
  return item
}

export async function setDone(id: string, done: boolean): Promise<void> {
  await getDb()
    .update(listTable)
    .set({ done, doneAt: done ? Date.now() : null })
    .where(eq(listTable.id, id))
}

/** Cambia lo que venga en el parche; `undefined` en url/forWhom/imageUrl/photo los vacía. */
export async function updateItem(id: string, patch: { name?: string } & ItemExtras): Promise<void> {
  const cols: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const clean = patch.name.trim()
    if (!clean) throw new Error('Falta el nombre.')
    cols.name = clean
  }
  if ('url' in patch) cols.url = cleanUrl(patch.url) ?? null
  if ('forWhom' in patch) cols.forWhom = patch.forWhom?.trim() || null
  if ('imageUrl' in patch) cols.imageUrl = patch.imageUrl ?? null
  if ('photo' in patch) cols.photo = patch.photo ?? null
  if (Object.keys(cols).length) await getDb().update(listTable).set(cols).where(eq(listTable.id, id))
}

/** Quita un elemento. Devuelve el nombre de su foto propia, si tenía, para borrar el fichero. */
export async function removeItem(id: string): Promise<string | undefined> {
  const res = await getDb().delete(listTable).where(eq(listTable.id, id)).returning({ photo: listTable.photo })
  return res[0]?.photo ?? undefined
}

/** Vacía la lista entera, hechos y pendientes. Devuelve las fotos que hay que borrar. */
export async function clearAll(list: ListKind): Promise<string[]> {
  const res = await getDb().delete(listTable).where(eq(listTable.list, list)).returning({ photo: listTable.photo })
  return res.map((r) => r.photo).filter((p): p is string => !!p)
}

/**
 * La lista de la compra como texto para mandarla por WhatsApp: solo lo que
 * falta por comprar, con guiones, que WhatsApp respeta tal cual.
 */
export function shareText(items: ListItem[], title = 'Lista de la compra'): string {
  const pending = items.filter((i) => !i.done).sort((a, b) => a.createdAt - b.createdAt)
  if (pending.length === 0) return ''
  return [`${title}:`, ...pending.map((i) => `- ${i.name}`)].join('\n')
}

/** Personas a las que hay ideas de regalo, por orden alfabético. «Sin decidir» al final. */
export const NO_ONE = 'Sin decidir'

export function giftsByPerson(items: ListItem[]): { person: string; items: ListItem[] }[] {
  const groups = new Map<string, ListItem[]>()
  for (const i of items) {
    const key = i.forWhom?.trim() || NO_ONE
    const found = [...groups.keys()].find((k) => sameText(k, key)) ?? key
    groups.set(found, [...(groups.get(found) ?? []), i])
  }
  return [...groups.entries()]
    .map(([person, list]) => ({ person, items: list }))
    .sort((a, b) => (a.person === NO_ONE ? 1 : b.person === NO_ONE ? -1 : a.person.localeCompare(b.person)))
}

/** Borra los ya hechos de una lista. Devuelve las fotos que hay que borrar. */
export async function clearDone(list: ListKind): Promise<string[]> {
  const res = await getDb()
    .delete(listTable)
    .where(and(eq(listTable.list, list), eq(listTable.done, true)))
    .returning({ photo: listTable.photo })
  return res.map((r) => r.photo).filter((p): p is string => !!p)
}

export async function listItems(list: ListKind): Promise<ListItem[]> {
  const rows = await getDb()
    .select()
    .from(listTable)
    .where(eq(listTable.list, list))
    .orderBy(asc(listTable.done), asc(listTable.createdAt))
  return rows.map(rowToListItem)
}
