#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Giữ máy Mac không ngủ (pmset disablesleep) — hữu ích khi chạy tunnel/server lâu.

Usage:
  ./scripts/sleep.sh           # xem trạng thái hiện tại
  ./scripts/sleep.sh status
  ./scripts/sleep.sh on        # bật: máy không ngủ
  ./scripts/sleep.sh off       # tắt: trở lại bình thường
  ./scripts/sleep.sh toggle    # đảo trạng thái

Ghi chú:
  - Cần sudo cho on/off/toggle.
  - Kiểm tra bằng: pmset -g | grep SleepDisabled
EOF
}

sleep_disabled() {
  pmset -g 2>/dev/null | awk '/SleepDisabled/ { print $2; exit }'
}

show_status() {
  local state
  state="$(sleep_disabled)"

  echo "Trạng thái pmset (SleepDisabled):"
  if [[ "$state" == "1" ]]; then
    echo "  ON  — máy đang KHÔNG được phép ngủ (disablesleep 1)"
  elif [[ "$state" == "0" ]]; then
    echo "  OFF — máy được phép ngủ bình thường (disablesleep 0)"
  else
    echo "  ?   — không đọc được SleepDisabled"
  fi

  echo
  echo "Chi tiết sleep hiện tại:"
  pmset -g 2>/dev/null | grep -E 'SleepDisabled| sleep ' || true
}

require_sudo() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    exec sudo "$0" "$@"
  fi
}

set_state() {
  local value="$1"
  pmset -a disablesleep "$value"
}

ACTION="${1:-status}"

case "$ACTION" in
  status)
    show_status
    ;;
  on|enable|1)
    require_sudo "$@"
    set_state 1
    echo "Đã bật: disablesleep 1"
    show_status
    ;;
  off|disable|0)
    require_sudo "$@"
    set_state 0
    echo "Đã tắt: disablesleep 0"
    show_status
    ;;
  toggle)
    require_sudo "$@"
    if [[ "$(sleep_disabled)" == "1" ]]; then
      set_state 0
      echo "Đã tắt: disablesleep 0"
    else
      set_state 1
      echo "Đã bật: disablesleep 1"
    fi
    show_status
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Lệnh không hợp lệ: $ACTION"
    echo
    usage
    exit 1
    ;;
esac
