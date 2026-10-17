# ─────────────────────────────────────────────────────────
# noticias.py: Audio de noticias del día para la app Ludok Home
# ─────────────────────────────────────────────────────────
#
# Lo lanza el cron cada mañana. Lee las noticias de Nextcloud News, las pasa a
# voz con Piper (en local) y deja noticias.ogg y noticias.json en la carpeta
# de Ludok Home de Nextcloud, de donde las descarga la app.

from datetime import datetime
from core.sources import get_news
from core.audio import generar_audio_noticias, subir_noticias

def main():
    print("=" * 50)
    print(f"📰 LUDOK HOME, noticias: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("=" * 50)

    articles = get_news()
    if not articles:
        print("ℹ️  No hay noticias nuevas, no se genera audio")
        return

    audio, indice = generar_audio_noticias(articles)
    if not audio:
        print("⚠️  No se pudo generar el audio")
        return

    subir_noticias(audio, indice)
    print("=" * 50)
    print("✅ Noticias listas")

if __name__ == "__main__":
    main()
