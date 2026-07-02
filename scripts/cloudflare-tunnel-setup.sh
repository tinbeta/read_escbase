#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="$ROOT_DIR/.cloudflared"
TUNNEL_NAME="fast-escbase"
HOSTNAME="fast.escbase.xyz"
DNS_LABEL="fast"
CNAME_TARGET=""

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Chưa có cloudflared. Cài bằng: brew install cloudflared"
  exit 1
fi

lookup_tunnel_id() {
  cloudflared tunnel list -n "$TUNNEL_NAME" -o json 2>/dev/null | python3 -c "
import json, sys
try:
    rows = json.load(sys.stdin)
except json.JSONDecodeError:
    rows = []
print(rows[0]['id'] if rows else '')
" 2>/dev/null || true
}

mkdir -p "$CF_DIR"

if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  echo "==> Bước 1/4: Đăng nhập Cloudflare"
  echo "    Mở trình duyệt và chọn zone escbase.xyz"
  cloudflared tunnel login
fi

TUNNEL_ID="$(lookup_tunnel_id)"
if [[ -n "$TUNNEL_ID" ]]; then
  echo "==> Bước 2/4: Tunnel '${TUNNEL_NAME}' đã tồn tại (${TUNNEL_ID})"
else
  echo "==> Bước 2/4: Tạo tunnel '${TUNNEL_NAME}'"
  cloudflared tunnel create "$TUNNEL_NAME"
  TUNNEL_ID="$(lookup_tunnel_id)"
fi

if [[ -z "$TUNNEL_ID" ]]; then
  echo "Không lấy được TUNNEL_ID. Chạy: cloudflared tunnel list -n ${TUNNEL_NAME}"
  exit 1
fi

CNAME_TARGET="${TUNNEL_ID}.cfargotunnel.com"

CRED_SRC="$HOME/.cloudflared/${TUNNEL_ID}.json"
CRED_DST="$CF_DIR/credentials.json"
if [[ ! -f "$CRED_SRC" ]]; then
  echo "Không thấy credentials: $CRED_SRC"
  exit 1
fi
cp "$CRED_SRC" "$CRED_DST"

echo "==> Bước 3/4: Ghi tunnel config"
"$ROOT_DIR/scripts/ensure-cloudflared-config.sh"

echo "==> Bước 4/4: Cấu hình DNS trên Cloudflare"
echo "    ${HOSTNAME} → ${CNAME_TARGET}"

DNS_OK=0
if cloudflared tunnel route dns --overwrite-dns "$TUNNEL_ID" "$HOSTNAME"; then
  DNS_OK=1
elif cloudflared tunnel route dns --overwrite-dns "$TUNNEL_NAME" "$HOSTNAME"; then
  DNS_OK=1
fi

if [[ "$DNS_OK" -ne 1 ]]; then
  echo
  echo "Không tự cấu hình DNS được."
  echo "Thường do chưa chọn đúng zone escbase.xyz lúc login, hoặc record đang bị khóa."
  echo
  echo "Thêm thủ công trên Cloudflare Dashboard:"
  echo "  Type:   CNAME"
  echo "  Name:   ${DNS_LABEL}"
  echo "  Target: ${CNAME_TARGET}"
  echo "  Proxy:  Proxied (đám mây cam)"
  exit 1
fi

echo "    ✓ DNS đã cấu hình."

if command -v dig >/dev/null 2>&1; then
  echo "    Kiểm tra nhanh:"
  dig +short "$HOSTNAME" CNAME | sed 's/\.$//' | while read -r line; do
    [[ -n "$line" ]] && echo "      CNAME → $line"
  done || true
fi

echo
echo "========================================"
echo "Tunnel ID : ${TUNNEL_ID}"
echo "DNS target: ${CNAME_TARGET}"
echo "URL       : https://${HOSTNAME}"
echo "========================================"
echo
echo "Supabase → Authentication → URL Configuration:"
echo "  Site URL: https://${HOSTNAME}"
echo "  Redirect URLs: https://${HOSTNAME}/**"
echo
echo "Chạy app + tunnel:"
echo "  cd \"$ROOT_DIR\" && ./scripts/start-with-tunnel.sh"
