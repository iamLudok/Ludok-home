// Modelo de datos de Ludok Home.
//
// El formato de las copias (`BackupFile`) solo crece: se pueden AÑADIR campos
// opcionales, pero cambiar o quitar los que ya existen dejaría fuera cualquier
// copia guardada antes. Los campos ausentes son `undefined`, nunca `null`.
//
// Las fechas de calendario (un día concreto, sin hora) van como texto
// 'YYYY-MM-DD' en hora local. No se guardan como timestamp porque un instante
// cae en días distintos según la zona horaria, y "el repostaje fue el día 3"
// tiene que seguir siendo el día 3 aunque cambie la hora del móvil.

/** Día de calendario local, 'YYYY-MM-DD'. */
export type DayString = string

/** Hora local 'HH:MM'. */
export type TimeString = string

/* --- Coche --------------------------------------------------------------- */

export type CarExpenseKind = 'gasolina' | 'taller' | 'recambio'

export interface CarExpense {
  id: string
  date: DayString
  kind: CarExpenseKind
  /**
   * Importe en CÉNTIMOS. En euros con decimales las sumas de un año acaban en
   * 1234.5699999 y el gráfico enseña céntimos que no existen.
   */
  totalCents: number
  /** Solo gasolina. */
  liters?: number
  /** Solo gasolina, €/L con tres decimales como en el surtidor. */
  pricePerLiter?: number
  /** Taller y recambios: qué se hizo o qué se compró. */
  description?: string
  /** Kilómetros del coche en ese momento, si se apuntan. Sirve para el consumo. */
  odometerKm?: number
  createdAt: number
}

/* --- Medicinas ----------------------------------------------------------- */

export interface Medicine {
  id: string
  name: string
  /** 1 = todos los días, 2 = cada 48 h, etc. */
  everyDays: number
  /** Hora a la que toca tomarla. Ahí llega el primer aviso. */
  time: TimeString
  /** Avisos de repaso si a esas horas sigue sin marcarse. */
  reminders: TimeString[]
  /** Desde cuándo se toma. Antes de este día no cuenta como olvidada. */
  startDate: DayString
  /**
   * Una medicina que ya no se toma no se borra: se desactiva. Así su historial
   * sigue en el gráfico de adherencia y no se pierde nada al cambiar de pauta.
   */
  active: boolean
  createdAt: number
}

export interface MedicineIntake {
  id: string
  medicineId: string
  date: DayString
  takenAt: number
}

/* --- Listas -------------------------------------------------------------- */

export type ListKind = 'compra' | 'wishlist' | 'regalos'

export interface ListItem {
  id: string
  list: ListKind
  name: string
  url?: string
  /** Comprado (compra) o regalado (regalos). */
  done: boolean
  doneAt?: number
  createdAt: number
  /** Solo regalos: para quién es. Desde la v2. */
  forWhom?: string
  /** Imagen de vista previa sacada del enlace (una URL de internet). Desde la v2. */
  imageUrl?: string
  /**
   * Foto propia elegida de la galería: solo el NOMBRE del fichero dentro de la
   * carpeta de fotos de la app, nunca la ruta entera, que cambia entre
   * instalaciones. En las copias viaja dentro, en `BackupFile.photos`. Desde la v2.
   */
  photo?: string
}

/* --- Notas rápidas ------------------------------------------------------- */

export interface QuickNote {
  id: string
  text: string
  /**
   * Día para el que se apuntó como «para hoy». Ausente = nota para tener en
   * mente, sin fecha. Una nota de hoy que no se hace sigue saliendo los días
   * siguientes, marcada como pendiente desde ese día.
   */
  forDay?: DayString
  done: boolean
  doneAt?: number
  createdAt: number
}

/* --- Guardados para luego ------------------------------------------------ */

export type SavedKind = 'video' | 'web'

export interface SavedLink {
  id: string
  url: string
  title?: string
  kind: SavedKind
  /** Etiquetas libres en minúsculas: «receta», «app», «portfolio»… */
  tags: string[]
  imageUrl?: string
  note?: string
  /** Ya lo hice: la receta cocinada, la app probada. */
  done: boolean
  doneAt?: number
  createdAt: number
}

/* --- Ajustes ------------------------------------------------------------- */

export interface Settings {
  id: 'app'
  theme: 'dark' | 'light' | 'system'
  lastBackup: number
  /** Cuándo se pasó la bienvenida. Ausente = aún no se ha visto. */
  onboardedAt?: number

  /** Base del servidor, p. ej. http://100.64.0.1:8080 */
  nextcloudUrl?: string
  nextcloudUser?: string
  /**
   * Contraseña de aplicación de Nextcloud.
   *
   * NO se incluye en las copias exportadas a propósito: una copia se comparte y
   * se mueve de sitio, y esta contraseña da permiso de ESCRITURA sobre tus
   * ficheros, notas y calendario. Al restaurar hay que volver a escribirla.
   */
  nextcloudPassword?: string
  /** Carpeta de tus ficheros donde van las copias y de donde sale el audio. */
  nextcloudFolder?: string
  /** Si la copia se sube sola al abrir la app. */
  autoBackup?: boolean
  lastAutoBackupAt?: number
  /**
   * Cuándo se trajeron los datos de las notas del bot de Telegram. Se guarda
   * para no ofrecer la importación otra vez y no duplicar todo.
   */
  notesImportedAt?: number

  /** API de Docker de la Pi, por Tailscale: http://100.x.x.x:2375 */
  dockerUrl?: string
  /** La misma API por la WiFi de casa (http://192.168.1.x:2375), para cuando no hay Tailscale. */
  dockerLanUrl?: string
  /**
   * Aviso diario de que las noticias están listas: 'HH:MM', o 'off' si está
   * apagado. Ausente = a la hora por defecto (`DEFAULT_NEWS_REMINDER`), para que las instalaciones que ya existían
   * lo tengan sin tener que ir a Ajustes.
   */
  newsReminder?: string
  dockerUser?: string
  /**
   * Contraseña de la API de Docker. Igual que la de Nextcloud, NO va en las
   * copias: quien la tiene controla Docker entero, que es casi ser root en la Pi.
   */
  dockerPassword?: string
  schemaVersion: number
}

/* --- Red de casa ---------------------------------------------------------- */

/** El nombre que le pones a un dispositivo de la red, por su MAC. */
export interface DeviceName {
  mac: string
  name: string
}

/** Estructura del fichero de copia de seguridad (export/import). */
export interface BackupFile {
  app: 'ludok-home'
  schemaVersion: number
  exportedAt: number
  carExpenses: CarExpense[]
  medicines: Medicine[]
  intakes: MedicineIntake[]
  listItems: ListItem[]
  /** Opcionales: las copias de la v1 no los traen, y el formato solo crece. */
  notes?: QuickNote[]
  saved?: SavedLink[]
  /** Nombres de los dispositivos de la red. Desde la v3 del formato. */
  deviceNames?: DeviceName[]
  /** Fotos propias de las listas, para que la copia sea un solo fichero. */
  photos?: BackupPhoto[]
  settings: Settings | null
}

export interface BackupPhoto {
  /** El mismo nombre que guarda `ListItem.photo`. */
  name: string
  /** data:image/jpeg;base64,… */
  dataUrl: string
}
