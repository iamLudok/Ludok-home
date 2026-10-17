# ─────────────────────────────────────────────────────────
# sources.py: Noticias de Nextcloud News
# ─────────────────────────────────────────────────────────

import re
import requests
from .config import CONFIG

def _palabras(titulo):
    """Palabras con contenido del titular (descarta las cortas: el, de, que...)."""
    return {w for w in re.findall(r"\w+", titulo.lower()) if len(w) > 3}

def _repetida(titulo, vistos):
    """
    Un mismo hecho llega con titulares casi iguales (el feed lo republica
    retocado, o lo cuentan dos fuentes): por eso se compara por palabras
    en común y no por texto exacto
    """
    p = _palabras(titulo)
    return any(p and v and len(p & v) / min(len(p), len(v)) >= 0.6 for v in vistos)

def get_news(max_per_feed=2):
    """
    Devuelve hasta max_per_feed artículos no leídos de cada feed
    para asegurar variedad entre fuentes, sin noticias repetidas
    """
    print("📰 Leyendo noticias...")
    articles = []
    vistos   = []
    auth = (CONFIG["nextcloud_user"], CONFIG["nextcloud_password"])
    base = f"{CONFIG['nextcloud_url']}/index.php/apps/news/api/v1-3"
    try:
        feeds_resp = requests.get(f"{base}/feeds", auth=auth, timeout=15)
        feeds_resp.raise_for_status()
        feeds = feeds_resp.json().get("feeds", [])

        for feed in feeds:
            resp = requests.get(
                f"{base}/items",
                auth=auth,
                params={"batchSize": 50, "offset": 0, "type": 0, "id": feed["id"], "getRead": False},
                timeout=15,
            )
            resp.raise_for_status()
            items = sorted(
                resp.json().get("items", []),
                key=lambda x: x.get("pubDate") or 0,
                reverse=True,
            )
            del_feed = 0
            for item in items:
                if del_feed >= max_per_feed:
                    break
                titulo = item.get("title", "")
                if _repetida(titulo, vistos):
                    continue
                vistos.append(_palabras(titulo))
                del_feed += 1
                body_clean = re.sub(r"<[^>]+>", "", item.get("body", ""))[:600]
                articles.append({
                    "title":   titulo,
                    "summary": body_clean.strip(),
                    "feed":    feed["title"],
                    "date":    item.get("pubDate"),
                })

        print(f"   → {len(articles)} artículos de {len(feeds)} feeds")
    except Exception as e:
        print(f"   ⚠️  Error en noticias: {e}")
    return articles