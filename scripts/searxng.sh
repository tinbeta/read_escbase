#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SEARXNG_DIR="$ROOT_DIR/searxng"
APP_ENV="$ROOT_DIR/.env"
SEARXNG_ENV="$SEARXNG_DIR/.env"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/searxng.sh start      Start local SearXNG on 127.0.0.1:8080
  ./scripts/searxng.sh stop       Stop local SearXNG
  ./scripts/searxng.sh restart    Restart local SearXNG
  ./scripts/searxng.sh status     Show Docker Compose service status
  ./scripts/searxng.sh logs       Follow SearXNG logs
  ./scripts/searxng.sh test       Test JSON search API
  ./scripts/searxng.sh configure  Point app .env to local SearXNG
EOF
}

need_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return 0
  fi

  echo "Không tìm thấy Docker Compose."
  echo "Cài Docker Desktop cho Mac rồi mở Docker Desktop trước khi chạy SearXNG:"
  echo "  https://www.docker.com/get-started/"
  echo
  echo "Sau đó chạy lại:"
  echo "  ./scripts/searxng.sh start"
  exit 1
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s | shasum -a 256 | awk '{print $1}'
  fi
}

ensure_searxng_env() {
  if [[ ! -f "$SEARXNG_ENV" ]]; then
    cp "$SEARXNG_DIR/.env.example" "$SEARXNG_ENV"
  fi

  if ! grep -q '^SEARXNG_SECRET=[^[:space:]]' "$SEARXNG_ENV"; then
    local secret
    secret="$(generate_secret)"
    if grep -q '^SEARXNG_SECRET=' "$SEARXNG_ENV"; then
      tmp="$(mktemp)"
      sed "s/^SEARXNG_SECRET=.*/SEARXNG_SECRET=$secret/" "$SEARXNG_ENV" > "$tmp"
      mv "$tmp" "$SEARXNG_ENV"
    else
      printf '\nSEARXNG_SECRET=%s\n' "$secret" >> "$SEARXNG_ENV"
    fi
  fi
}

env_value() {
  local key="$1"
  local fallback="$2"
  if [[ -f "$SEARXNG_ENV" ]]; then
    local line
    line="$(grep -E "^${key}=" "$SEARXNG_ENV" | tail -n 1 || true)"
    if [[ -n "$line" ]]; then
      printf '%s' "${line#*=}"
      return 0
    fi
  fi
  printf '%s' "$fallback"
}

upsert_app_env() {
  local key="$1"
  local value="$2"
  touch "$APP_ENV"
  if grep -q "^${key}=" "$APP_ENV"; then
    tmp="$(mktemp)"
    sed "s|^${key}=.*|${key}=${value}|" "$APP_ENV" > "$tmp"
    mv "$tmp" "$APP_ENV"
  else
    printf '%s=%s\n' "$key" "$value" >> "$APP_ENV"
  fi
}

configure_app_env() {
  ensure_searxng_env
  local host
  local port
  host="$(env_value SEARXNG_HOST 127.0.0.1)"
  port="$(env_value SEARXNG_PORT 8080)"
  upsert_app_env WEB_SEARCH_PROVIDER auto
  upsert_app_env SEARXNG_URL "http://${host}:${port}"
  echo "Đã trỏ app .env sang SearXNG: http://${host}:${port}"
  echo "Nếu Next.js đang chạy, restart server để đọc lại .env."
}

compose() {
  (cd "$SEARXNG_DIR" && docker compose "$@")
}

start() {
  need_docker
  ensure_searxng_env
  configure_app_env
  compose up -d
  test_api
}

test_api() {
  ensure_searxng_env
  local host
  local port
  host="$(env_value SEARXNG_HOST 127.0.0.1)"
  port="$(env_value SEARXNG_PORT 8080)"
  local url="http://${host}:${port}/search?q=searxng&format=json"

  echo "Kiểm tra JSON API: $url"
  for _ in {1..30}; do
    body="$(curl -fsS "$url" 2>/dev/null || true)"
    if [[ -n "$body" ]]; then
      if printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); if (!Array.isArray(j.results)) process.exit(1); console.log(`OK: ${j.results.length} results`);})' 2>/dev/null; then
        return 0
      fi
    fi
    sleep 1
  done

  echo "SearXNG chưa trả JSON hợp lệ. Xem logs bằng:"
  echo "  ./scripts/searxng.sh logs"
  return 1
}

cmd="${1:-}"
case "$cmd" in
  start) start ;;
  stop) need_docker; compose down ;;
  restart) need_docker; compose down; start ;;
  status) need_docker; compose ps ;;
  logs) need_docker; compose logs -f core ;;
  test) test_api ;;
  configure) configure_app_env ;;
  ""|-h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
