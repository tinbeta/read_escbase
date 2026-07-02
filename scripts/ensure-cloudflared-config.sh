#!/usr/bin/env bash
# Ghi lại .cloudflared/config.yml với đường dẫn tuyệt đối theo máy hiện tại.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="$ROOT_DIR/.cloudflared"
CRED="$CF_DIR/credentials.json"
CONFIG="$CF_DIR/config.yml"
HOSTNAME="${CLOUDFLARE_HOSTNAME:-fast.escbase.xyz}"
PORT="${PORT:-3000}"

if [[ ! -f "$CRED" ]]; then
  echo "Thiếu $CRED"
  echo "Nếu copy từ máy cũ: giữ nguyên thư mục .cloudflared/ trong bản zip."
  echo "Nếu máy mới hoàn toàn: chạy ./scripts/cloudflare-tunnel-setup.sh"
  exit 1
fi

TUNNEL_ID="$(python3 -c "import json; print(json.load(open('$CRED'))['TunnelID'])")"

mkdir -p "$CF_DIR"
cat > "$CONFIG" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED}

ingress:
  - hostname: ${HOSTNAME}
    service: http://127.0.0.1:${PORT}
  - service: http_status:404
EOF

echo "Đã cập nhật tunnel config → $CONFIG"
