// Fotos propias de la wishlist y los regalos (cuando el enlace no trae vista
// previa, como pasa con Amazon a veces, o si prefieres tu propia foto).
//
// Se guardan reducidas en la carpeta de documentos de la app. En la base solo
// va el NOMBRE del fichero: la ruta completa cambia entre instalaciones y, al
// restaurar una copia en otro móvil, apuntaría a la nada.
import { Directory, File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { newId } from './ids'
import type { BackupPhoto } from '../types'

/**
 * 800 px de ancho y JPEG al 70 %: unos 60-120 KB por foto. Viajan dentro de la
 * copia de seguridad, y con fotos de 4 MB del móvil la copia diaria pasaría
 * de pesar KB a pesar cientos de MB.
 */
const MAX_WIDTH = 800
const QUALITY = 0.7

function dir(): Directory {
  const d = new Directory(Paths.document, 'fotos')
  d.create({ idempotent: true, intermediates: true })
  return d
}

export function photoUri(name: string): string {
  return new File(dir(), name).uri
}

/** Abre la galería y guarda la foto elegida. Devuelve su nombre, o null si se canceló. */
export async function pickPhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true })
  if (res.canceled || !res.assets?.[0]) return null
  const asset = res.assets[0]
  const ctx = ImageManipulator.manipulate(asset.uri)
  if ((asset.width ?? MAX_WIDTH + 1) > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH })
  const image = await ctx.renderAsync()
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG })
  const name = `${newId()}.jpg`
  new File(saved.uri).move(new File(dir(), name))
  return name
}

export function deletePhoto(name: string | undefined): void {
  if (!name) return
  try {
    const f = new File(dir(), name)
    if (f.exists) f.delete()
  } catch {
    // Una foto que ya no está no es un problema: el elemento se quita igual.
  }
}

/** Las fotos que existen, como data: URL, para meterlas en la copia. */
export async function photosForBackup(names: string[]): Promise<BackupPhoto[]> {
  const out: BackupPhoto[] = []
  for (const name of new Set(names)) {
    const f = new File(dir(), name)
    if (!f.exists) continue
    out.push({ name, dataUrl: `data:image/jpeg;base64,${await f.base64()}` })
  }
  return out
}

/** Escribe a fichero las fotos que traía una copia restaurada. */
export function restorePhotos(photos: BackupPhoto[]): number {
  let n = 0
  for (const p of photos) {
    // Solo nombres planos: un nombre con «/» o «..» en una copia manipulada
    // podría escribir fuera de la carpeta de fotos.
    if (!/^[\w-]+\.jpg$/i.test(p.name)) continue
    const m = /^data:image\/[a-z]+;base64,(.+)$/i.exec(p.dataUrl)
    if (!m) continue
    const f = new File(dir(), p.name)
    f.create({ overwrite: true })
    f.write(m[1], { encoding: 'base64' })
    n++
  }
  return n
}
