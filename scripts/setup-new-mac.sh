#!/usr/bin/env bash
# Setup một lần sau khi giải nén cả thư mục dự án sang Mac mới.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { echo; bold "==> $*"; }

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    return 1
  fi
}

ensure_homebrew() {
  if need_cmd brew; then
    return 0
  fi
  step "Cài Homebrew (cần cho yt-dlp, ffmpeg, cloudflared, node...)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

brew_install() {
  local pkg="$1"
  if need_cmd "$pkg"; then
    echo "  ✓ $pkg"
    return 0
  fi
  echo "  + brew install $pkg"
  brew install "$pkg"
}

node_major() {
  node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0
}

step "Fast Escbase — setup máy mới"
echo "Thư mục dự án: $ROOT_DIR"

step "1/6 Kiểm tra Homebrew + công cụ hệ thống"
ensure_homebrew
brew_install yt-dlp
brew_install ffmpeg
brew_install cloudflared

NODE_MAJOR="$(node_major)"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "  Node hiện tại: $(node -v 2>/dev/null || echo 'chưa có') — cần >= 22"
  brew_install node
  NODE_MAJOR="$(node_major)"
fi
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Node vẫn < 22 sau khi cài. Thử: brew install node@22 && brew link --overwrite node@22"
  exit 1
fi
echo "  ✓ node $(node -v)"

step "2/6 npm install"
npm install

step "3/6 Python venv + faster-whisper"
if [[ ! -x ".venv/bin/python3" ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q faster-whisper
echo "  ✓ .venv/bin/python3 + faster-whisper"

step "4/6 Kiểm tra .env"
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "  Đã tạo .env từ .env.example — mở file và điền key trước khi chạy production."
  else
    echo "  ⚠ Thiếu .env — copy từ máy cũ hoặc tạo thủ công."
  fi
else
  echo "  ✓ .env đã có"
fi

step "5/6 Cloudflare Tunnel (.cloudflared/)"
if [[ -f .cloudflared/credentials.json ]]; then
  chmod +x scripts/ensure-cloudflared-config.sh
  ./scripts/ensure-cloudflared-config.sh
  echo "  ✓ Tunnel credentials + config sẵn sàng"
else
  echo "  ⚠ Thiếu .cloudflared/credentials.json"
  echo "    Copy cả thư mục .cloudflared/ từ máy cũ trong bản zip,"
  echo "    hoặc chạy: ./scripts/cloudflare-tunnel-setup.sh"
fi

step "6/6 Build production (tùy chọn, giúp start nhanh hơn)"
npm run build

echo
bold "========================================"
bold "Xong. Chạy app + tunnel:"
echo "  cd \"$ROOT_DIR\""
echo "  ./scripts/start-with-tunnel.sh"
echo
echo "Giữ Mac không ngủ khi chạy lâu:"
echo "  ./scripts/sleep.sh on"
echo
echo "Chỉ dev local (không tunnel):"
echo "  npm run dev"
bold "========================================"
