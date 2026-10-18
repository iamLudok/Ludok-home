// Vista previa de un enlace: título e imagen, como la que enseña WhatsApp.
//
// La parte pura (leer el HTML, reconocer Amazon, limpiar lo que comparte
// Instagram) se prueba en `verify/links.ts`; `fetchPreview` es la única que va
// a la red. Sin nada nativo: `fetch` existe también en Node.
import type { SavedKind } from '../types'

export interface Preview {
  title?: string
  imageUrl?: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Valor de un <meta> por property o name, en cualquier orden de atributos. */
function meta(html: string, key: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (name?.toLowerCase() !== key) continue
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag)
    const value = content?.[1] ?? content?.[2]
    if (value?.trim()) return decodeEntities(value.trim())
  }
  return undefined
}

/** Resuelve una URL relativa (`/img/a.jpg`, `//cdn…`) contra la de la página. */
function absolute(url: string, base: string): string | undefined {
  try {
    return new URL(url, base).toString()
  } catch {
    return undefined
  }
}

/** Título e imagen de una página: Open Graph, luego Twitter, luego <title>. */
export function parsePreview(html: string, pageUrl: string): Preview {
  const rawImage = meta(html, 'og:image') ?? meta(html, 'og:image:url') ?? meta(html, 'twitter:image') ?? meta(html, 'twitter:image:src')
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]
  const rawTitle = meta(html, 'og:title') ?? meta(html, 'twitter:title') ?? (titleTag ? decodeEntities(titleTag) : undefined)
  const title = rawTitle?.replace(/\s+/g, ' ').trim()
  const imageUrl = rawImage ? absolute(rawImage, pageUrl) : undefined
  return {
    title: title || undefined,
    // Solo http(s): un data: o un javascript: no se pinta ni se guarda.
    imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : undefined,
  }
}

/** Código de producto de Amazon (ASIN) de una URL de producto, o null. */
export function amazonAsin(url: string): string | null {
  if (!/(^|\.)amazon\.[a-z.]+/i.test(hostOf(url))) return null
  const m = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})(?=[/?#]|$)/i.exec(url)
  return m ? m[1].toUpperCase() : null
}

/**
 * Foto de un producto de Amazon a partir de su ASIN. La página del producto
 * no sirve: Amazon le enseña un captcha a todo lo que no sea un navegador.
 */
export function amazonImageUrl(asin: string): string {
  return `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

const VIDEO_HOSTS = ['instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'm.youtube.com', 'vm.tiktok.com']

/** Vídeo si viene de una red de vídeos (reels, tiktoks, youtube); web todo lo demás. */
export function kindFromUrl(url: string): SavedKind {
  const host = hostOf(url)
  return VIDEO_HOSTS.some((h) => host === h || host.endsWith('.' + h)) ? 'video' : 'web'
}

/** Parámetros de rastreo que no cambian la página y sí ensucian el enlace guardado. */
const TRACKING = /^(utm_\w+|igsh|igshid|fbclid|gclid|si|ref|ref_src|feature|_branch_\w+|mibextid)$/i

/**
 * Enlace limpio y comparable: sin parámetros de rastreo ni fragmento. Sirve
 * para no guardar dos veces el mismo reel compartido desde dos sitios.
 */
export function cleanLink(raw: string): string {
  try {
    // Se reconstruye a mano y no con `u.hash = ''` ni `searchParams.delete`: en
    // React Native el URL nativo no tiene setters, y lo que en Node funciona
    // en el móvil fallaba sin decir nada.
    const u = new URL(raw.trim())
    const kept = (u.search.startsWith('?') ? u.search.slice(1) : u.search)
      .split('&')
      .filter((pair) => pair && !TRACKING.test(decodeURIComponent(pair.split('=')[0])))
    return `${u.protocol}//${u.host}${u.pathname}${kept.length ? '?' + kept.join('&') : ''}`
  } catch {
    return raw.trim()
  }
}

/**
 * Lo que llega al compartir desde otra app: a veces solo el enlace, a veces
 * «Mira este reel de @alguien https://…» o un título y el enlace en dos líneas.
 * Devuelve el primer enlace y lo que quede como posible título.
 */
export function splitShared(text: string): { url: string | null; rest: string } {
  const m = /https?:\/\/[^\s<>"]+/i.exec(text)
  if (!m) return { url: null, rest: text.trim() }
  const url = m[0].replace(/[),.;!?]+$/, '')
  const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim()
  return { url, rest }
}

/**
 * Identidad propia y honesta, no la de un Chrome de Android. Probado
 * (octubre 2026): con la de Chrome móvil Instagram devuelve una página sin
 * og:image, y con esta sí, igual que YouTube, GitHub o Awwwards. Las tiendas
 * que bloquean (El Corte Inglés, Zalando, Decathlon, Behance) bloquean las dos
 * por igual, así que hacerse pasar por navegador no ganaba nada.
 */
const APP_UA = 'Mozilla/5.0 (compatible; LudokHome/1.1; vista previa de enlaces)'

/**
 * Pide la página y saca su vista previa. Nunca lanza: sin vista previa el
 * enlace se guarda igual, y eso es lo único que de verdad importa.
 */
export async function fetchPreview(url: string, timeoutMs = 8000): Promise<Preview> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const asin = amazonAsin(url)
    if (asin) {
      // Si el producto no tiene foto en ese sitio, Amazon devuelve un GIF de
      // 43 bytes en vez de un error: se mira el tipo para no guardar un hueco.
      const res = await fetch(amazonImageUrl(asin), { method: 'HEAD', signal: controller.signal })
      const type = res.headers.get('content-type') ?? ''
      return res.ok && type.includes('jpeg') ? { imageUrl: amazonImageUrl(asin) } : {}
    }
    const res = await fetch(url, {
      headers: { 'User-Agent': APP_UA, Accept: 'text/html', 'Accept-Language': 'es-ES,es;q=0.9' },
      signal: controller.signal,
    })
    // Los enlaces cortos (amzn.eu, vm.tiktok) redirigen: si acabó en Amazon, por
    // ASIN, y antes de mirar el estado, porque la página final suele ser un captcha.
    const finalAsin = amazonAsin(res.url)
    if (finalAsin) return { imageUrl: amazonImageUrl(finalAsin) }
    if (!res.ok) return {}
    const html = (await res.text()).slice(0, 400_000)
    return parsePreview(html, res.url || url)
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}
