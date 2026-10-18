// Euros ↔ céntimos. Todo el dinero se guarda en céntimos enteros (ver
// `CarExpense.totalCents`); los euros con decimales solo existen en pantalla.

/**
 * Lee un número escrito a mano: «40», «40,5», «40.50», «1.234,56».
 * Devuelve el valor, o null si no es un número positivo.
 *
 * Con coma y punto a la vez, el último que aparece es el decimal: así entran
 * tanto «1.234,56» (como se escribe aquí) como «1,234.56» (como se copia de
 * una web en inglés). Con un solo separador se trata como decimal, porque en el
 * teclado numérico de Android es el que sale, y nadie escribe «1.234» queriendo
 * decir mil doscientos euros de gasolina.
 */
export function parseDecimal(text: string): number | null {
  const s = text.trim().replace(/\s|€/g, '')
  if (!s) return null
  let normalized: string
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.'
    const thousands = dec === ',' ? '.' : ','
    normalized = s.split(thousands).join('').replace(dec, '.')
  } else {
    normalized = s.replace(',', '.')
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return value > 0 ? value : null
}

/** Igual que `parseDecimal`, en céntimos. */
export function parseEuros(text: string): number | null {
  const value = parseDecimal(text)
  if (value === null) return null
  const cents = Math.round(value * 100)
  return cents > 0 ? cents : null
}

/** 123456 → «123.456» (miles con punto, sin depender del idioma del motor). */
export function formatThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** 123456 → «1.234,56 €» */
export function formatEuros(cents: number, withSymbol = true): string {
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const euros = Math.floor(abs / 100)
  const rest = String(abs % 100).padStart(2, '0')
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${grouped},${rest}${withSymbol ? ' €' : ''}`
}

/** Número con coma decimal y sin ceros sobrantes: 1.659 → «1,659», 40.0 → «40». */
export function formatDecimal(value: number, decimals = 2): string {
  const fixed = value.toFixed(decimals)
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  return trimmed.replace('.', ',')
}
