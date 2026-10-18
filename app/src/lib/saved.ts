// Guardados para luego: reels de recetas, apps que probar, portfolios, webs.
// Todo en un sitio, con etiquetas libres para encontrarlo después.
import { desc, eq } from 'drizzle-orm'
import { getDb } from './dbRef'
import { savedLinks as savedTable } from './schema'
import { rowToSavedLink, savedLinkToRow } from './rows'
import { patchToColumns } from './sqlHelpers'
import { newId } from './ids'
import { cleanLink, kindFromUrl } from './linkPreview'
import type { SavedLink } from '../types'

/**
 * «Receta, comida rápida ,  App» → ['receta', 'comida rápida', 'app'].
 * En minúsculas y sin repetir: «Receta» y «receta» tienen que ser la misma
 * etiqueta o el filtro se parte en dos.
 */
export function normalizeTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,#\n]/)
  return [...new Set(parts.map((t) => t.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))]
}

/** Etiquetas en uso, las más usadas primero (para sugerirlas y para los filtros). */
export function tagCounts(links: SavedLink[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const l of links) for (const t of l.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export interface SavedFilter {
  tag?: string
  /** Por defecto solo lo pendiente. */
  done?: boolean
}

export function filterSaved(links: SavedLink[], filter: SavedFilter): SavedLink[] {
  return links
    .filter((l) => l.done === (filter.done ?? false))
    .filter((l) => !filter.tag || l.tags.includes(filter.tag))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export interface SavedInput {
  url: string
  title?: string
  tags: string[] | string
  imageUrl?: string
  note?: string
}

/**
 * Guarda un enlace. Si ya estaba (el mismo reel compartido dos veces), no lo
 * duplica: le suma las etiquetas nuevas y devuelve el que había.
 */
export async function addSaved(input: SavedInput): Promise<{ link: SavedLink; existed: boolean }> {
  const url = cleanLink(input.url)
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('Eso no parece un enlace.')
  const tags = normalizeTags(input.tags)
  const db = getDb()
  const existing = (await db.select().from(savedTable).where(eq(savedTable.url, url)).limit(1))[0]
  if (existing) {
    const link = rowToSavedLink(existing)
    const merged = normalizeTags([...link.tags, ...tags])
    await db.update(savedTable).set({ tags: JSON.stringify(merged) }).where(eq(savedTable.id, link.id))
    return { link: { ...link, tags: merged }, existed: true }
  }
  const link: SavedLink = {
    id: newId(),
    url,
    title: input.title?.trim() || undefined,
    kind: kindFromUrl(url),
    tags,
    imageUrl: input.imageUrl,
    note: input.note?.trim() || undefined,
    done: false,
    createdAt: Date.now(),
  }
  await db.insert(savedTable).values(savedLinkToRow(link))
  return { link, existed: false }
}

export async function updateSaved(
  id: string,
  patch: { title?: string; tags?: string[] | string; note?: string; imageUrl?: string },
): Promise<void> {
  const { tags, title, note, ...rest } = patch
  const cols = patchToColumns(rest)
  if (title !== undefined) cols.title = title.trim() || null
  if (note !== undefined) cols.note = note.trim() || null
  if (tags !== undefined) cols.tags = JSON.stringify(normalizeTags(tags))
  await getDb().update(savedTable).set(cols).where(eq(savedTable.id, id))
}

export async function setSavedDone(id: string, done: boolean): Promise<void> {
  await getDb()
    .update(savedTable)
    .set({ done, doneAt: done ? Date.now() : null })
    .where(eq(savedTable.id, id))
}

export async function deleteSaved(id: string): Promise<void> {
  await getDb().delete(savedTable).where(eq(savedTable.id, id))
}

export async function listSaved(): Promise<SavedLink[]> {
  const rows = await getDb().select().from(savedTable).orderBy(desc(savedTable.createdAt))
  return rows.map(rowToSavedLink)
}
