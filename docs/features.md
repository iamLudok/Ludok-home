# News Audio

Every morning at 7:30 the Pi turns your Nextcloud News feeds into a short audio for the Ludok Home app. Everything runs locally: the speech is synthesized with [Piper](https://github.com/OHF-Voice/piper1-gpl) on the Pi.

## What it does

1. Reads the unread items of each feed in Nextcloud News ([core/sources.py](../core/sources.py)).
2. Keeps **2 stories per feed** (`max_per_feed` in `get_news()`) and drops near-duplicates: two headlines count as the same story when most of their meaningful words match, so a story republished with a slightly different headline, or told by two feeds, is read only once.
3. Synthesizes each story separately ([core/tts_worker.py](../core/tts_worker.py)), so it knows the second at which each one starts, then joins them into a single OGG/Opus file with `ffmpeg`.
4. Uploads `noticias.ogg` and then `noticias.json` to the `Ludok Home` folder of your Nextcloud files. The audio goes first: if the upload fails halfway, the app never sees a new index pointing to an old audio.

`noticias.json` looks like this:

```json
{
  "fecha": "2026-10-18",
  "generado": "2026-10-18T07:31:12",
  "duracion": 240.5,
  "noticias": [
    { "feed": "BBC Mundo", "titulo": "…", "inicio": 2.68 }
  ]
}
```

The app downloads both files to the phone as soon as it can reach Nextcloud, so you can listen without coverage, and uses `inicio` to jump between stories.

## Resources

Measured on a Raspberry Pi with 8 GB of RAM, 12 stories (about 4 minutes of audio): **~40 seconds** to generate and **~770 MB of RAM** at peak, once a day. Synthesis runs with `nice -n 19`, so Nextcloud keeps priority.

## Customizing

- **Voice**: download any `.onnx` + `.onnx.json` pair from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) and set `PIPER_VOICE` in `.env`.
- **What is read**: the script for each story is built in `segmentos_noticias()` ([core/audio.py](../core/audio.py)).
- **Feeds**: the voice is Spanish, so feeds in other languages sound wrong. Remove them in Nextcloud News.
- **Time**: edit the cron line with `crontab -e`.
