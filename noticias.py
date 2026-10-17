# ─────────────────────────────────────────────────────────
# briefing.py: Script principal
# ─────────────────────────────────────────────────────────

import os
import sys
import requests
from datetime import datetime
from core.config import CONFIG
from core.sources import get_calendar_events, get_tasks, get_news
from core.ai import build_briefing
from core.audio import generar_audio_noticias, subir_noticias

def send_telegram(message):
    """
    Envía el mensaje por Telegram.
    Si el mensaje supera 4000 caracteres lo divide en partes,
    ya que Telegram tiene un límite de 4096 por mensaje.
    """
    print("📱 Enviando por Telegram...")
    try:
        chunks = [message[i:i+4000] for i in range(0, len(message), 4000)]
        for chunk in chunks:
            resp = requests.post(
                f"https://api.telegram.org/bot{CONFIG['telegram_token']}/sendMessage",
                json={
                    "chat_id": CONFIG["telegram_chat_id"],
                    "text": chunk,
                },
                timeout=15,
            )
            resp.raise_for_status()
        print("   ✅ Enviado correctamente")
        return True
    except Exception as e:
        print(f"   ⚠️  Error Telegram: {e}")
        return False

def send_voice_telegram(audio, caption=""):
    """
    Envía una nota de voz (OGG/Opus) por Telegram
    """
    print("🎧 Enviando audio por Telegram...")
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{CONFIG['telegram_token']}/sendVoice",
            data={"chat_id": CONFIG["telegram_chat_id"], "caption": caption},
            files={"voice": ("noticias.ogg", audio, "audio/ogg")},
            timeout=120,
        )
        resp.raise_for_status()
        print("   ✅ Audio enviado")
        return True
    except Exception as e:
        print(f"   ⚠️  Error enviando audio: {e}")
        return False

def main():
    print("=" * 50)
    print(f"🌅 LUDOK HOME: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("=" * 50)

    # Paso 1: Recoger todos los datos del día
    events    = get_calendar_events()
    tasks     = get_tasks()
    articles  = get_news()

    # Paso 2: Noticias en audio (si Piper no está disponible, solo texto)
    # Se dejan también en Nextcloud para la app Ludok Home
    audio, indice = generar_audio_noticias(articles)
    if audio:
        subir_noticias(audio, indice)

    # Paso 3: Construir el briefing con todos los datos
    briefing = build_briefing(events, tasks, articles, con_audio=bool(audio))

    # Paso 4 (opcional): guardar el briefing para depuración
    if "--debug" in sys.argv:
        debug_path = os.path.join(os.path.dirname(__file__), "briefing.txt")
        with open(debug_path, "w") as f:
            f.write(briefing)
        print(f"   📝 Briefing guardado en {debug_path}")

    # Paso 5: Enviar el briefing y el audio por Telegram
    send_telegram(briefing)
    if audio:
        send_voice_telegram(audio, "📰 Noticias de hoy")

    print("=" * 50)
    print("✅ Ludok Home completado")

if __name__ == "__main__":
    main()