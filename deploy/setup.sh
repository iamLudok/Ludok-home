set -e

# Raíz del proyecto (este script vive en deploy/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "================================================"
echo "  Ludok Home: daily news audio on your Pi"
echo "================================================"
echo ""
echo "Requirements: Nextcloud with the News app installed."
echo "The Pi turns your Nextcloud News feeds into a daily audio for the Ludok Home app."

# ── 1. System dependencies ───────────────────────
echo ""
echo "📦 Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y python3-pip python3-venv curl ffmpeg

# ── 2. Python virtual environment ───────────────
echo ""
echo "🐍 Creating Python virtual environment..."
python3 -m venv "$HOME/ludok-home-env"
source "$HOME/ludok-home-env/bin/activate"

pip install --upgrade pip -q
pip install -r "$SCRIPT_DIR/requirements.txt" -q

echo "   ✅ Python libraries installed"

# ── 3. Piper voice (news audio) ──────────────────
echo ""
echo "🎧 Downloading Spanish voice for news audio..."
VOICE_DIR="$SCRIPT_DIR/voices"
VOICE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium"
mkdir -p "$VOICE_DIR"
for f in es_ES-davefx-medium.onnx es_ES-davefx-medium.onnx.json; do
    [ -f "$VOICE_DIR/$f" ] || curl -sL -o "$VOICE_DIR/$f" "$VOICE_URL/$f"
done
echo "   ✅ Voice ready in $VOICE_DIR"

# ── 4. .env file ─────────────────────────────────
echo ""
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    echo "📝 .env file created from .env.example"
    echo "   ⚠️  Edit .env with your credentials before running Ludok Home"
else
    echo "   ℹ️  .env already exists, skipping"
fi

# ── 5. Daily news cron job ───────────────────────
echo ""
echo "⏰ Setting up daily cron job (every day at 5:45)..."

CRON_LINE="45 5 * * * $HOME/ludok-home-env/bin/python3 $SCRIPT_DIR/noticias.py >> $HOME/ludok-home.log 2>&1"
(crontab -l 2>/dev/null | grep -v "noticias.py"; echo "$CRON_LINE") | crontab -

echo "   ✅ Cron configured: every day at 5:45"
echo "   📝 Logs at: ~/ludok-home.log"

# ── Done ─────────────────────────────────────────
echo ""
echo "================================================"
echo "  ✅ Installation complete"
echo "================================================"
echo ""
echo "NEXT STEPS:"
echo "  1. Edit .env with your credentials:"
echo "     nano $SCRIPT_DIR/.env"
echo ""
echo "  2. Generate today's news audio by hand to test it:"
echo "     $HOME/ludok-home-env/bin/python3 $SCRIPT_DIR/noticias.py"
echo ""
echo "  3. Install the Android app (see app/README.md) and set up Nextcloud in its Settings."
echo ""
