/**
 * Al compartir algo a la app, `expo-share-intent` la abre con un enlace interno
 * del tipo ludokhome://dataUrl=…, que no es ninguna pantalla. Sin esto,
 * expo-router enseñaba «pantalla no encontrada» en vez de Hoy; el contenido
 * compartido lo recoge `ShareReceiver` por su cuenta.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return path.includes('dataUrl=') ? '/' : path
}
