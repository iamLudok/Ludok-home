# ─────────────────────────────────────────────────────────
# tts_worker.py: Sintetiza varios textos con Piper, un .wav por texto
# ─────────────────────────────────────────────────────────
#
# Se lanza como proceso aparte (python -m core.tts_worker) para poder bajarle
# la prioridad con nice sin bajársela al resto del briefing, y para que los
# ~600 MB del modelo se liberen en cuanto termina.
#
# Uso: echo '["texto 1", "texto 2"]' | python -m core.tts_worker voz.onnx carpeta/
# Escribe carpeta/000.wav, carpeta/001.wav, ...

import json
import os
import sys
import wave
from piper import PiperVoice

def main():
    voz, carpeta = sys.argv[1], sys.argv[2]
    textos = json.load(sys.stdin)
    # El modelo se carga UNA vez: cargarlo por cada noticia (lo que haría
    # llamar al ejecutable de piper en bucle) añadía segundos por noticia.
    voice = PiperVoice.load(voz)
    for i, texto in enumerate(textos):
        with wave.open(os.path.join(carpeta, f"{i:03d}.wav"), "wb") as wav:
            voice.synthesize_wav(texto, wav)

if __name__ == "__main__":
    main()
