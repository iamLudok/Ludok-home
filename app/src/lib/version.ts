/**
 * Versión del formato de las COPIAS DE SEGURIDAD (no la del esquema de SQLite,
 * que es `DB_VERSION` en `schemaSql.ts` y va por su cuenta).
 *
 * `importBackup` rechaza cualquier copia con una versión mayor que esta. Vive en
 * un módulo propio y sin dependencias para que lo puedan usar tanto los
 * mapeadores de filas como el núcleo de copias sin crear un ciclo de imports.
 */
// v2: notas rápidas, guardados, y para quién / vista previa / foto en las
// listas. Una copia de la v1 sigue entrando: todo lo nuevo es opcional.
// v3: nombres de los dispositivos de la red (`deviceNames`), también opcional.
export const SCHEMA_VERSION = 3
