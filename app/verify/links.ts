/**
 * Vista previa de enlaces, sin red: leer el HTML, reconocer Amazon, limpiar lo
 * que llega al compartir desde Instagram o el navegador.
 */
import { check, eq, finish } from './harness'
import { amazonAsin, amazonImageUrl, cleanLink, kindFromUrl, parsePreview, splitShared } from '../src/lib/linkPreview'

function main() {
  console.log('HTML de la página')
  const og = parsePreview(
    `<html><head><title>Título de la pestaña</title>
     <meta content="https://cdn.ejemplo.com/foto.jpg?w=1200&amp;h=630" property="og:image" />
     <meta property='og:title' content='Zapatillas &quot;Trail&quot; &#x2022; Tienda'>
     </head></html>`,
    'https://tienda.ejemplo.com/p/1',
  )
  eq('og:image con los atributos al revés y &amp;', og.imageUrl, 'https://cdn.ejemplo.com/foto.jpg?w=1200&h=630')
  eq('og:title con comillas simples y entidades', og.title, 'Zapatillas "Trail" • Tienda')
  const rel = parsePreview('<meta name="twitter:image" content="/img/a.png"><title> Mi   portfolio </title>', 'https://ana.dev/trabajos/')
  eq('imagen relativa resuelta contra la página', rel.imageUrl, 'https://ana.dev/img/a.png')
  eq('sin og:title se usa <title>, sin espacios de más', rel.title, 'Mi portfolio')
  eq('una imagen javascript: no se acepta', parsePreview('<meta property="og:image" content="javascript:alert(1)">', 'https://x.com').imageUrl, undefined)
  eq('una página sin nada da vista previa vacía', JSON.stringify(parsePreview('<html></html>', 'https://x.com')), '{}')

  console.log('\nAmazon')
  eq('ASIN de /dp/', amazonAsin('https://www.amazon.es/Auriculares-Sony/dp/B0CFPJYX7P/ref=sr_1_3?keywords=sony'), 'B0CFPJYX7P')
  eq('ASIN de /gp/product/', amazonAsin('https://amazon.es/gp/product/b07pxgqc1q'), 'B07PXGQC1Q')
  eq('no es Amazon, no hay ASIN', amazonAsin('https://tienda.com/dp/B0CFPJYX7P'), null)
  eq('URL de la foto por ASIN', amazonImageUrl('B0CFPJYX7P'), 'https://m.media-amazon.com/images/P/B0CFPJYX7P.01._SCLZZZZZZZ_.jpg')

  console.log('\nLo que llega al compartir')
  const insta = splitShared('Mira este reel de @cocinafacil https://www.instagram.com/reel/C9x/?igsh=MWQ1 ')
  eq('el enlace dentro del texto de Instagram', insta.url, 'https://www.instagram.com/reel/C9x/?igsh=MWQ1')
  eq('y lo demás como posible título', insta.rest, 'Mira este reel de @cocinafacil')
  eq('el punto final no es parte del enlace', splitShared('Echa un ojo: https://ana.dev.').url, 'https://ana.dev')
  eq('sin enlace no hay URL', splitShared('solo texto').url, null)
  eq('fuera rastreo: igsh y utm', cleanLink('https://www.instagram.com/reel/C9x/?igsh=MWQ1&utm_source=ig_web'), 'https://www.instagram.com/reel/C9x/')
  eq('los parámetros que importan se quedan', cleanLink('https://www.youtube.com/watch?v=abc&si=xyz'), 'https://www.youtube.com/watch?v=abc')
  eq('fuera el fragmento', cleanLink('https://ana.dev/#contacto'), 'https://ana.dev/')

  console.log('\nVídeo o web')
  check('reel de Instagram', kindFromUrl('https://www.instagram.com/reel/C9x/') === 'video')
  check('TikTok', kindFromUrl('https://vm.tiktok.com/ZMabc/') === 'video')
  check('YouTube corto', kindFromUrl('https://youtu.be/abc') === 'video')
  check('una web cualquiera', kindFromUrl('https://dribbble.com/shots/1') === 'web')

  finish('verify:links')
}

main()
