/**
 * Tokens de diseño. ÚNICA fuente de color y de medidas: ninguna pantalla
 * inventa un hex ni un padding suelto. Si falta algo, se añade aquí.
 *
 * La identidad es «Sala oscura», la de Ludok Time, Ludok Been y Ludrest:
 * interfaz monocroma a propósito, SIN color de acento. Lo que en otras apps
 * sería el color de marca aquí es el contraste (`fg` sobre `bg`).
 *
 * Aquí no hay carátulas ni fotos que pongan color, así que el único color es el
 * de los datos, y siempre con significado:
 * - `series*`: qué es cada barra del gráfico del coche (gasolina, taller,
 *   recambios), siempre en ese orden fijo y con leyenda.
 * - `taken` / `missed` / `pending`: el estado de una medicina, siempre con su
 *   símbolo al lado (el color nunca va solo). Los mismos tres sirven para el
 *   estado de un contenedor (bien / mal / a medias), siempre con su texto.
 * - `danger` solo para borrar y `warn` solo para avisos.
 *
 * Los colores de gráficos están validados (separación para daltonismo y
 * contraste) contra `surface` de cada modo; si cambia `surface`, se revalidan.
 */

export interface Palette {
  /** Fondo de la pantalla. */
  bg: string
  /** Tarjetas y superficies elevadas. */
  surface: string
  /** Superficie un paso más marcada (huecos de imagen, pistas de progreso). */
  surface2: string
  /** Líneas y separadores. */
  line: string
  /** Texto principal. */
  fg: string
  /** Texto secundario. */
  muted: string
  /** Texto muy secundario (fechas, contadores). */
  faint: string
  /** Relleno de lo marcado como visto (y su texto encima). */
  on: string
  onFg: string
  /** Solo para acciones destructivas. */
  danger: string
  /** Solo para el aviso de copia de seguridad. */
  warn: string
  /** Sombra/velo sobre imágenes. */
  scrim: string
  /** Categorías del gráfico del coche, en orden fijo: gasolina, taller, recambios. */
  series1: string
  series2: string
  series3: string
  /** Estado de una medicina en el gráfico de adherencia. */
  taken: string
  missed: string
  pending: string
  /** Símbolo encima de tomada/olvidada, y encima de pendiente (amarillo claro en los dos modos). */
  onStatus: string
  onPending: string
}

/** La identidad elegida: negro de sala de cine, interfaz monocroma. */
export const dark: Palette = {
  bg: '#0a0a0c',
  surface: '#141419',
  surface2: '#1e1e24',
  line: '#22222a',
  fg: '#f3f1ec',
  muted: '#85838d',
  faint: '#615f69',
  on: '#f3f1ec',
  onFg: '#0a0a0c',
  danger: '#e2564d',
  warn: '#d9a34a',
  scrim: 'rgba(0,0,0,0.55)',
  series1: '#3987e5',
  series2: '#d95926',
  series3: '#199e70',
  taken: '#0ca30c',
  missed: '#d03b3b',
  pending: '#fab219',
  onStatus: '#ffffff',
  onPending: '#0b0b0b',
}

/**
 * La misma idea con la luz encendida. No es el oscuro invertido sin más: los
 * grises se eligen para que el contraste aguante igual sobre blanco, y los
 * colores de gráficos son los mismos tonos un paso más oscuros.
 */
export const light: Palette = {
  bg: '#f6f5f3',
  surface: '#ffffff',
  surface2: '#e8e6e2',
  line: '#dcd9d4',
  fg: '#16151a',
  muted: '#6b6873',
  faint: '#928f99',
  on: '#16151a',
  onFg: '#f6f5f3',
  danger: '#c2382f',
  warn: '#8a5c12',
  scrim: 'rgba(0,0,0,0.35)',
  series1: '#2a78d6',
  series2: '#eb6834',
  series3: '#1baf7a',
  taken: '#0ca30c',
  missed: '#d03b3b',
  pending: '#fab219',
  onStatus: '#ffffff',
  onPending: '#0b0b0b',
}

/** Escala de espaciado (múltiplos de 4, sin valores a ojo). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 4,
  md: 8,
  lg: 14,
  pill: 999,
} as const

/** Escala tipográfica. `data` lleva cifras tabulares, para que no bailen. */
export const type = {
  display: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  section: { fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontSize: 14, fontWeight: '500' },
  small: { fontSize: 12.5, fontWeight: '500' },
  label: { fontSize: 10.5, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase' },
  data: { fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  /** Logs, comandos y docker-compose: columnas que cuadran. */
  mono: { fontSize: 11.5, fontFamily: 'monospace', lineHeight: 16 },
} as const
