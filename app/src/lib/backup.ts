// Capa nativa de las copias de seguridad: ficheros, compartir y selector.
// Toda la lógica de datos vive en `backupCore.ts`, que se prueba aparte.
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as DocumentPicker from 'expo-document-picker'
import { db } from './db'
import { updateSettings } from './settings'
import { backupFilename } from './backupPolicy'
import * as core from './backupCore'
import { photosForBackup, restorePhotos } from './photos'
import type { BackupFile } from '../types'

export type { ImportResult } from './backupCore'
export { daysSinceBackup } from './backupCore'

/** La copia completa, con las fotos propias de las listas dentro. */
export async function exportAll(): Promise<BackupFile> {
  const data = await core.exportAll(db)
  const names = data.listItems.map((i) => i.photo).filter((p): p is string => !!p)
  const photos = await photosForBackup(names)
  return photos.length ? { ...data, photos } : data
}

export async function importBackup(
  raw: string,
  mode: 'replace' | 'merge' = 'replace',
): Promise<core.ImportResult> {
  const res = await core.importBackup(db, raw, mode)
  restorePhotos(res.photos)
  return res
}

/**
 * Escribe la copia y abre el menú de compartir para guardarla donde quieras
 * (Archivos, Nextcloud, Drive…). Devuelve la ruta del fichero generado.
 */
export async function shareBackup(): Promise<string> {
  const data = await exportAll()
  const file = new File(Paths.cache, backupFilename())
  file.create({ overwrite: true })
  file.write(JSON.stringify(data, null, 2))

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Copia de Ludok Home',
      UTI: 'public.json',
    })
  }
  await updateSettings({ lastBackup: Date.now() })
  return file.uri
}

/** Abre el selector de ficheros y devuelve el contenido del JSON elegido. */
export async function pickJsonFile(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  })
  if (res.canceled || !res.assets?.[0]) return null
  return await new File(res.assets[0].uri).text()
}
