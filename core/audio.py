# ─────────────────────────────────────────────────────────
# audio.py: Noticias en audio con Piper (TTS local, sin servicios externos)
# ─────────────────────────────────────────────────────────

import os
import re
import sys
import html
import json
import wave
import subprocess
import tempfile
from datetime import date, datetime
import requests
from .config import CONFIG

def _limpiar(texto):
    """Quita etiquetas HTML, entidades y espacios repetidos."""
    texto = html.unescape(re.sub(r"<[^>]+>", " ", texto or ""))
    return re.sub(r"\s+", " ", texto).strip()

def _recortar(texto, max_chars=350):
    """Recorta el texto al final de la última frase completa antes de max_chars."""
    if len(texto) <= max_chars:
        return texto
    corte = texto[:max_chars]
    fin   = max(corte.rfind(". "), corte.rfind("? "), corte.rfind("! "))
    return corte[:fin + 1] if fin > 0 else corte.rsplit(" ", 1)[0] + "."

def segmentos_noticias(articles):
    """
    Divide el guion en trozos: la entrada, una por noticia y la despedida
    Cada trozo se sintetiza aparte para saber en qué segundo empieza cada
    noticia (lo usa la app para saltar de una a otra)
    Devuelve [{"texto": ..., "feed": ..., "titulo": ...}]; feed y titulo
    van a None en la entrada y la despedida
    """
    if not articles:
        return []
    segmentos = [{"texto": f"Buenos días. Hoy tienes {len(articles)} noticias.", "feed": None, "titulo": None}]
    feed_actual = None
    for a in articles:
        partes = []
        # Agrupa por feed para no repetir la fuente en cada noticia
        if a["feed"] != feed_actual:
            feed_actual = a["feed"]
            partes.append(f"En {feed_actual}.")
        titulo = _limpiar(a["title"]).rstrip(".")
        partes.append(f"{titulo}.")
        resumen = _recortar(_limpiar(a.get("summary", "")))
        if resumen:
            partes.append(resumen)
        segmentos.append({"texto": " ".join(partes), "feed": a["feed"], "titulo": titulo})
    segmentos.append({"texto": "Eso es todo por hoy.", "feed": None, "titulo": None})
    return segmentos

def _duracion_wav(ruta):
    with wave.open(ruta, "rb") as w:
        return w.getnframes() / w.getframerate()

def generar_audio_noticias(articles):
    """
    Sintetiza las noticias con Piper y las une en un solo OGG/Opus
    Devuelve (bytes del .ogg, índice) o (None, None) si falta Piper, la voz o ffmpeg
    El índice es la lista de noticias con el segundo en que empieza cada una
    """
    voz = CONFIG["piper_voice"]
    segmentos = segmentos_noticias(articles)
    if not segmentos:
        return None, None
    if not os.path.isfile(voz):
        print(f"   ⚠️  Voz de Piper no encontrada en {voz}")
        return None, None

    print("🎧 Generando audio de noticias...")
    with tempfile.TemporaryDirectory() as tmp:
        ogg = os.path.join(tmp, "noticias.ogg")
        try:
            subprocess.run(
                # nice: que la síntesis no le quite CPU a Nextcloud mientras genera
                ["nice", "-n", "19", sys.executable, "-m", "core.tts_worker", voz, tmp],
                input=json.dumps([s["texto"] for s in segmentos]).encode("utf-8"),
                cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                check=True, capture_output=True, timeout=900,
            )
            wavs = [os.path.join(tmp, f"{i:03d}.wav") for i in range(len(segmentos))]

            indice, inicio = [], 0.0
            for seg, ruta in zip(segmentos, wavs):
                if seg["titulo"]:
                    indice.append({"feed": seg["feed"], "titulo": seg["titulo"], "inicio": round(inicio, 2)})
                inicio += _duracion_wav(ruta)

            # Lista para el concat de ffmpeg: une los .wav sin recodificarlos
            # entre sí, así los tiempos del índice cuadran con el audio final
            lista = os.path.join(tmp, "lista.txt")
            with open(lista, "w") as f:
                f.writelines(f"file '{r}'\n" for r in wavs)
            subprocess.run(
                ["nice", "-n", "19", "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                 "-i", lista, "-c:a", "libopus", "-b:a", "32k", "-ac", "1", ogg],
                check=True, capture_output=True, timeout=300,
            )
            with open(ogg, "rb") as f:
                data = f.read()
        except FileNotFoundError as e:
            print(f"   ⚠️  Falta un programa para el audio: {e}")
            return None, None
        except subprocess.CalledProcessError as e:
            print(f"   ⚠️  Error generando audio: {e.stderr.decode(errors='ignore')[-300:]}")
            return None, None
        except subprocess.TimeoutExpired:
            print("   ⚠️  La generación de audio tardó demasiado")
            return None, None

    resumen = {
        "fecha":    str(date.today()),
        "generado": datetime.now().isoformat(timespec="seconds"),
        "duracion": round(inicio, 2),
        "noticias": indice,
    }
    print(f"   → {len(data) // 1024} KB de audio, {len(indice)} noticias")
    return data, resumen

def subir_noticias(audio, resumen):
    """
    Deja el audio y su índice en la carpeta de Ludok Home de Nextcloud, de donde
    los descarga la app. Se sube primero el audio y después el índice: si algo
    falla a mitad, la app nunca ve un índice nuevo apuntando a un audio viejo
    """
    print("☁️  Subiendo noticias a Nextcloud...")
    auth    = (CONFIG["nextcloud_user"], CONFIG["nextcloud_password"])
    carpeta = f"{CONFIG['nextcloud_url']}/remote.php/dav/files/{CONFIG['nextcloud_user']}/{CONFIG['nextcloud_folder']}"
    try:
        # 201 creada, 405 ya existía
        r = requests.request("MKCOL", carpeta, auth=auth, timeout=30)
        if r.status_code not in (201, 405):
            r.raise_for_status()
        requests.put(f"{carpeta}/noticias.ogg", data=audio, auth=auth, timeout=120,
                     headers={"Content-Type": "audio/ogg"}).raise_for_status()
        requests.put(f"{carpeta}/noticias.json", auth=auth, timeout=30,
                     data=json.dumps(resumen, ensure_ascii=False, indent=2).encode("utf-8"),
                     headers={"Content-Type": "application/json"}).raise_for_status()
        print("   ✅ Noticias subidas")
        return True
    except Exception as e:
        print(f"   ⚠️  Error subiendo noticias: {e}")
        return False
