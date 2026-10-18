/**
 * DDL del esquema local. Vive aparte de `db.ts` (que importa expo-sqlite, y por
 * tanto solo funciona en el móvil) para que las pruebas de escritorio puedan
 * crear EXACTAMENTE el mismo esquema que crea la app. Si esto estuviera
 * duplicado en el test, el test validaría un esquema que no es el real.
 */
export const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS car_expenses (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  totalCents INTEGER NOT NULL,
  liters REAL,
  pricePerLiter REAL,
  description TEXT,
  odometerKm INTEGER,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  everyDays INTEGER NOT NULL,
  time TEXT NOT NULL,
  reminders TEXT NOT NULL DEFAULT '[]',
  startDate TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS intakes (
  id TEXT PRIMARY KEY NOT NULL,
  medicineId TEXT NOT NULL,
  date TEXT NOT NULL,
  takenAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS list_items (
  id TEXT PRIMARY KEY NOT NULL,
  list TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  doneAt INTEGER,
  createdAt INTEGER NOT NULL,
  forWhom TEXT,
  imageUrl TEXT,
  photo TEXT
);

CREATE TABLE IF NOT EXISTS quick_notes (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  forDay TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  doneAt INTEGER,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_links (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  kind TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  imageUrl TEXT,
  note TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  doneAt INTEGER,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_names (
  mac TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL,
  theme TEXT NOT NULL DEFAULT 'system',
  lastBackup INTEGER NOT NULL DEFAULT 0,
  onboardedAt INTEGER,
  nextcloudUrl TEXT,
  nextcloudUser TEXT,
  nextcloudPassword TEXT,
  nextcloudFolder TEXT,
  autoBackup INTEGER,
  lastAutoBackupAt INTEGER,
  notesImportedAt INTEGER,
  dockerUrl TEXT,
  dockerLanUrl TEXT,
  newsReminder TEXT,
  dockerUser TEXT,
  dockerPassword TEXT,
  contractDownMbps INTEGER,
  contractUpMbps INTEGER,
  weatherPlace TEXT,
  weatherLat REAL,
  weatherLon REAL,
  schemaVersion INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  fetchedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS car_expenses_date_idx ON car_expenses (date);
CREATE INDEX IF NOT EXISTS intakes_date_idx ON intakes (date);
-- Una medicina se toma como mucho una vez al día: el índice único es lo que
-- impide que dos toques seguidos en el botón dejen dos tomas el mismo día.
CREATE UNIQUE INDEX IF NOT EXISTS intakes_med_date_idx ON intakes (medicineId, date);
CREATE INDEX IF NOT EXISTS list_items_list_idx ON list_items (list);
CREATE INDEX IF NOT EXISTS quick_notes_done_idx ON quick_notes (done);
`

/**
 * Cambios de esquema sobre bases ya creadas, en orden. El índice del array + 1
 * es la versión a la que lleva cada paso (`PRAGMA user_version`).
 *
 * `CREATE_SQL` de arriba siempre describe el esquema COMPLETO y actual, así que
 * una instalación nueva no ejecuta ninguno de estos pasos: son solo para bases
 * que ya existían antes del cambio. Nunca se edita `CREATE_SQL` sin añadir aquí
 * el paso que lleva a las bases antiguas al mismo sitio.
 */
export const MIGRATIONS: string[] = [
  // v1 → v2: para quién es cada regalo, vista previa y foto en las listas,
  // notas rápidas y guardados para luego (vídeos y webs con etiquetas).
  `ALTER TABLE list_items ADD COLUMN forWhom TEXT;
   ALTER TABLE list_items ADD COLUMN imageUrl TEXT;
   ALTER TABLE list_items ADD COLUMN photo TEXT;
   CREATE TABLE IF NOT EXISTS quick_notes (
     id TEXT PRIMARY KEY NOT NULL,
     text TEXT NOT NULL,
     forDay TEXT,
     done INTEGER NOT NULL DEFAULT 0,
     doneAt INTEGER,
     createdAt INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS saved_links (
     id TEXT PRIMARY KEY NOT NULL,
     url TEXT NOT NULL,
     title TEXT,
     kind TEXT NOT NULL,
     tags TEXT NOT NULL DEFAULT '[]',
     imageUrl TEXT,
     note TEXT,
     done INTEGER NOT NULL DEFAULT 0,
     doneAt INTEGER,
     createdAt INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS quick_notes_done_idx ON quick_notes (done);`,
  // v2 → v3: conexión con la API de Docker de la Pi (pantalla Servidor).
  `ALTER TABLE settings ADD COLUMN dockerUrl TEXT;
   ALTER TABLE settings ADD COLUMN dockerUser TEXT;
   ALTER TABLE settings ADD COLUMN dockerPassword TEXT;`,
  // v3 → v4: dirección de Docker por la WiFi de casa, para cuando no hay Tailscale.
  `ALTER TABLE settings ADD COLUMN dockerLanUrl TEXT;`,
  // v4 → v5: hora del aviso diario de las noticias.
  `ALTER TABLE settings ADD COLUMN newsReminder TEXT;`,
  // v5 → v6: nombres de los dispositivos de la red de casa.
  `CREATE TABLE IF NOT EXISTS device_names (
     mac TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL
   );`,
  // v6 → v7: velocidad contratada, para el test de la línea.
  `ALTER TABLE settings ADD COLUMN contractDownMbps INTEGER;
   ALTER TABLE settings ADD COLUMN contractUpMbps INTEGER;`,
  // v7 → v8: ciudad fija para el tiempo de Hoy.
  `ALTER TABLE settings ADD COLUMN weatherPlace TEXT;
   ALTER TABLE settings ADD COLUMN weatherLat REAL;
   ALTER TABLE settings ADD COLUMN weatherLon REAL;`,
]

/** Versión actual del esquema local. */
export const DB_VERSION = MIGRATIONS.length + 1
