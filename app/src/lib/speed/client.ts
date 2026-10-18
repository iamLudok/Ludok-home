// El test de velocidad con el `fetch` de Expo, que deja leer la bajada por
// trozos (el de React Native solo la da entera al final). Separado de `run.ts`
// para que aquel siga sin nada nativo y se pueda probar con Node.
import { fetch } from 'expo/fetch'
import { CLOUDFLARE, runSpeedTest, type Progress } from './run'
import type { SpeedResult } from './core'

/** Lo que llega a este móvil, contra Cloudflare. */
export function phoneSpeedTest(onProgress: (p: Progress) => void, signal: AbortSignal): Promise<SpeedResult> {
  return runSpeedTest(fetch as never, CLOUDFLARE, onProgress, signal)
}

export { runLineTest } from './run'
