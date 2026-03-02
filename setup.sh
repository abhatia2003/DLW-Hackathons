#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
#  SandboxMind — setup.sh
#  Run this once before starting the server.
# ═══════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║     🧠  SandboxMind Setup v1.0        ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ─── Check Node.js ────────────────────────────────
echo "→ Checking Node.js..."

# Try common paths
for candidate in \
    "$(command -v node 2>/dev/null)" \
    "/usr/local/bin/node" \
    "/opt/homebrew/bin/node" \
    "$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | sort -V | tail -1)/bin/node" \
    "$HOME/.nodenv/shims/node"; do
  if [ -x "$candidate" ]; then
    NODE="$candidate"
    NPM="$(dirname "$NODE")/npm"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo ""
  echo "  ❌ Node.js not found. Please install it first:"
  echo ""
  echo "     Option 1 (recommended — Homebrew):"
  echo "       brew install node"
  echo ""
  echo "     Option 2 (nvm):"
  echo "       curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  echo "       nvm install 20"
  echo ""
  echo "     Option 3 (direct download):"
  echo "       https://nodejs.org/en/download"
  echo ""
  exit 1
fi

echo "  ✅ Node.js found: $($NODE --version) at $NODE"
echo "  ✅ npm found: $($NPM --version)"

# ─── Install dependencies ─────────────────────────
echo ""
echo "→ Installing npm dependencies..."
"$NPM" install
echo "  ✅ Dependencies installed"

# ─── Initialise demo-repo ─────────────────────────
echo ""
echo "→ Initialising demo-repo as a git repository..."

DEMO_REPO="$SCRIPT_DIR/demo-repo"

if [ ! -d "$DEMO_REPO/.git" ]; then
  cd "$DEMO_REPO"
  git init
  git add -A
  git commit -m "Initial demo-repo commit for SandboxMind"
  cd "$SCRIPT_DIR"
  echo "  ✅ demo-repo initialised"
else
  echo "  ✅ demo-repo already a git repo"
fi

# ─── Ensure data dirs ─────────────────────────────
mkdir -p data/patches
echo "  ✅ data/ directories ready"

# ─── Done ─────────────────────────────────────────
echo ""
echo "  ════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  To start the server:"
echo "    npm start     (if npm is in your PATH)"
echo "    OR"
echo "    $NODE server.js"
echo ""
echo "  Then open: http://localhost:3000"
echo ""
echo "  Demo repo path for the UI:"
echo "    $DEMO_REPO"
echo "  ════════════════════════════════════════"
echo ""
