#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CF_CONFIG="$ROOT_DIR/.cloudflared/config.yml"
PORT="${PORT:-3000}"

cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/.cloudflared/credentials.json" ]]; then
  echo "Chưa có tunnel credentials. Chạy trước:"
  echo "  ./scripts/cloudflare-tunnel-setup.sh"
  echo "Hoặc copy thư mục .cloudflared/ từ máy cũ rồi chạy ./scripts/setup-new-mac.sh"
  exit 1
fi

"$ROOT_DIR/scripts/ensure-cloudflared-config.sh"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Chưa có cloudflared. Cài bằng: brew install cloudflared"
  exit 1
fi

echo "==> Build production (nếu cần)..."
npm run build

echo "==> Start Next.js trên port ${PORT}..."
PORT="$PORT" npm run start &
NEXT_PID=$!

cleanup() {
  echo
  echo "==> Dừng server và tunnel..."
  kill "$NEXT_PID" 2>/dev/null || true
  wait "$NEXT_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

sleep 2
if ! kill -0 "$NEXT_PID" 2>/dev/null; then
  echo "Next.js không start được. Kiểm tra log phía trên."
  exit 1
fi

echo "==> Start Cloudflare Tunnel → https://fast.escbase.xyz"
echo "    (Ctrl+C để dừng cả server lẫn tunnel)"
cloudflared tunnel --config "$CF_CONFIG" run
