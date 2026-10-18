// Nombres de los dispositivos de la red de casa, por su MAC. Sin nada nativo.
import { eq } from 'drizzle-orm'
import { getDb } from './dbRef'
import { deviceNames } from './schema'

/**
 * MAC «aleatoria»: la inventan los móviles modernos para cada WiFi (bit de
 * «administrada localmente», el segundo carácter es 2, 6, a o e). Sirve para
 * decir «probablemente un móvil» cuando no tiene nombre.
 */
export function isRandomMac(mac: string): boolean {
  return /^.[26ae]/i.test(mac.trim())
}

/** Guarda el nombre; vacío lo borra. */
export async function setDeviceName(mac: string, name: string): Promise<void> {
  const key = mac.trim().toLowerCase()
  const clean = name.trim()
  const db = getDb()
  if (!clean) {
    await db.delete(deviceNames).where(eq(deviceNames.mac, key))
    return
  }
  await db.insert(deviceNames).values({ mac: key, name: clean }).onConflictDoUpdate({ target: deviceNames.mac, set: { name: clean } })
}

export async function listDeviceNames(): Promise<Record<string, string>> {
  const rows = await getDb().select().from(deviceNames)
  return Object.fromEntries(rows.map((r) => [r.mac, r.name]))
}
