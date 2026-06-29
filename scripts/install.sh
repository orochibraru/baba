#!/usr/bin/env sh
set -e

REPO="orochibraru/baba"
BIN_NAME="baba"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
VERSION="${VERSION:-latest}"
LIB_DIR="/var/lib/baba"
CONFIG_DEFAULT="${LIB_DIR}/config.default.json"
CONFIG_PATH="${CONFIG_PATH:-${LIB_DIR}/config.json}"

RAW_BASE="https://raw.githubusercontent.com/${REPO}/main"

# ── Detect OS ─────────────────────────────────────────────────────────────────

OS="$(uname -s)"
case "$OS" in
    Linux)  OS="linux"  ;;
    Darwin) OS="darwin" ;;
    *)
        echo "Unsupported OS: $OS" >&2
        echo "Please download the binary manually from https://github.com/$REPO/releases" >&2
        exit 1
        ;;
esac

# ── Detect architecture ───────────────────────────────────────────────────────

ARCH="$(uname -m)"
case "$ARCH" in
    x86_64)           ARCH="x64"   ;;
    aarch64 | arm64)  ARCH="arm64" ;;
    *)
        echo "Unsupported architecture: $ARCH" >&2
        echo "Please download the binary manually from https://github.com/$REPO/releases" >&2
        exit 1
        ;;
esac

ASSET="${BIN_NAME}-${OS}-${ARCH}"

# ── Build download URL ────────────────────────────────────────────────────────

if [ "$VERSION" = "latest" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
fi

# ── Dry-run mode (used by tests) ──────────────────────────────────────────────

if [ "${DRY_RUN:-}" = "1" ]; then
    echo "asset=${ASSET}"
    echo "url=${DOWNLOAD_URL}"
    echo "install_dir=${INSTALL_DIR}"
    exit 0
fi

# ── Helper: fetch URL to destination, using sudo if directory isn't writable ──

_fetch_to() {
    local url="$1" dest="$2"
    local dir
    dir="$(dirname "$dest")"
    local tmp
    tmp="$(mktemp)"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$tmp"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$tmp" "$url"
    else
        echo "Error: curl or wget is required" >&2
        rm -f "$tmp"
        return 1
    fi
    if [ -w "$dir" ]; then
        mv "$tmp" "$dest"
    else
        sudo mv "$tmp" "$dest"
    fi
}

# ── Download binary ───────────────────────────────────────────────────────────

echo "Downloading $ASSET..."
TMP_BIN="$(mktemp)"
if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$DOWNLOAD_URL" -o "$TMP_BIN"
elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP_BIN" "$DOWNLOAD_URL"
else
    echo "Error: curl or wget is required" >&2
    exit 1
fi
chmod +x "$TMP_BIN"

# ── Install binary ────────────────────────────────────────────────────────────

DEST="${INSTALL_DIR}/${BIN_NAME}"
if [ -w "$INSTALL_DIR" ]; then
    mv "$TMP_BIN" "$DEST"
else
    echo "Installing to $DEST (requires sudo)..."
    sudo mv "$TMP_BIN" "$DEST"
fi

# ── Create data directory ─────────────────────────────────────────────────────

if [ ! -d "$LIB_DIR" ]; then
    echo "Creating $LIB_DIR..."
    if [ -w "$(dirname "$LIB_DIR")" ]; then
        mkdir -p "$LIB_DIR"
    else
        sudo mkdir -p "$LIB_DIR"
        # Give ownership to the invoking user so baba can write without sudo
        sudo chown "$(id -un)" "$LIB_DIR" 2>/dev/null || true
    fi
fi

# ── Always refresh the immutable default template ─────────────────────────────

printf "Refreshing default config template at %s..." "$CONFIG_DEFAULT"
if _fetch_to "${RAW_BASE}/config.example.json" "$CONFIG_DEFAULT" 2>/dev/null; then
    echo " done."
else
    echo " failed (skipping)."
fi

# ── Seed config.json only if it doesn't already exist ────────────────────────

echo ""
if [ -f "$CONFIG_PATH" ]; then
    echo "Config already exists at $CONFIG_PATH — keeping it."
elif [ -f "$CONFIG_DEFAULT" ]; then
    if [ -w "$LIB_DIR" ]; then
        cp "$CONFIG_DEFAULT" "$CONFIG_PATH"
    else
        sudo cp "$CONFIG_DEFAULT" "$CONFIG_PATH"
    fi
    echo "Created $CONFIG_PATH from default template."
fi

echo ""
echo "baba installed to $DEST"
echo "Run 'baba setup' to configure interactively, or edit $CONFIG_PATH and run 'baba start'."
