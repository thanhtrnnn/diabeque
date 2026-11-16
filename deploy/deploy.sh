#!/usr/bin/env bash
# Deploy Diabeque (Chương 6) lên https://chatbot.drakefamtax.id.vn, tự dựng lại khi sập.
#
#   ./deploy/deploy.sh up       build web, ghi LaunchAgent, trỏ DNS, bật api + web + tunnel + watchdog
#   ./deploy/deploy.sh heal     kiểm từng tầng, tầng nào chết thì khởi động lại (watchdog gọi mỗi 60 giây)
#   ./deploy/deploy.sh status   trạng thái các tầng
#   ./deploy/deploy.sh rebuild  build lại web rồi khởi động lại web (sau khi sửa frontend)
#   ./deploy/deploy.sh down     gỡ cả bốn LaunchAgent (Neo4j giữ nguyên)
#
# Các tầng, mỗi tầng một LaunchAgent có KeepAlive:
#   neo4j (docker) <- api :8200 <- web :3200 <- cloudflared tunnel <- chatbot.drakefamtax.id.vn
# API chỉ nghe 127.0.0.1; ra Internet chỉ có web qua tunnel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/chap6-agents"
WEB="$APP/frontend"
LOGS="$ROOT/deploy/logs"
AGENTS="$HOME/Library/LaunchAgents"
UIDN="$(id -u)"
DOMAIN="chatbot.drakefamtax.id.vn"
TUNNEL_ID="f3e19326-929f-47f7-bbab-7cb7768453e7"   # tunnel "diabeque-lab", credentials sẵn trong ~/.cloudflared
TUNNEL_CFG="$HOME/.cloudflared/diabeque-chatbot.yml"
API_PORT=8200
WEB_PORT=3200
PREFIX="vn.id.drakefamtax.diabeque"
SVCS=(api web tunnel watchdog)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

label() { echo "$PREFIX-$1"; }
plist() { echo "$AGENTS/$(label "$1").plist"; }
log()   { mkdir -p "$LOGS"; echo "$(date '+%F %T') $*" | tee -a "$LOGS/heal.log" >&2; }
loaded() { launchctl print "gui/$UIDN/$(label "$1")" >/dev/null 2>&1; }
code()  { curl -s -o /dev/null -w '%{http_code}' -m 8 "$1" 2>/dev/null || true; }

# ---------- LaunchAgent ----------
# write_plist <svc> <keepalive|interval> <cwd> <env KEY=VAL,...> <argv...>
write_plist() {
  local svc="$1" mode="$2" cwd="$3" envs="$4"; shift 4
  mkdir -p "$AGENTS" "$LOGS"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "<key>Label</key><string>$(label "$svc")</string>"
    echo "<key>WorkingDirectory</key><string>$cwd</string>"
    echo '<key>ProgramArguments</key><array>'
    for a in "$@"; do echo "<string>$a</string>"; done
    echo '</array>'
    echo "<key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATH</string>"
    local IFS=','; for kv in $envs; do [ -n "$kv" ] && echo "<key>${kv%%=*}</key><string>${kv#*=}</string>"; done; unset IFS
    echo '</dict>'
    echo "<key>StandardOutPath</key><string>$LOGS/$svc.log</string>"
    echo "<key>StandardErrorPath</key><string>$LOGS/$svc.log</string>"
    echo '<key>RunAtLoad</key><true/>'
    if [ "$mode" = keepalive ]; then
      echo '<key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer>'
    else
      echo '<key>StartInterval</key><integer>60</integer>'
    fi
    echo '</dict></plist>'
  } > "$(plist "$svc")"
}

write_all_plists() {
  local server
  server="$(web_server)"
  write_plist api keepalive "$APP" "" \
    "$ROOT/.venv/bin/python" -m uvicorn backend.app.main:app --host 127.0.0.1 --port "$API_PORT"
  write_plist web keepalive "$(dirname "$server")" "PORT=$WEB_PORT,HOSTNAME=127.0.0.1,API_BASE_URL=http://127.0.0.1:$API_PORT/api/v1,NODE_ENV=production" \
    "$(command -v node)" "$server"
  write_plist tunnel keepalive "$ROOT" "" \
    "$(command -v cloudflared)" --config "$TUNNEL_CFG" --no-autoupdate tunnel run
  # launchd chạy /bin/bash không đọc được script dưới ~/Desktop (macOS TCC, exit 126);
  # python3 đã có quyền nên dùng làm trampoline, bash con kế thừa quyền đó.
  write_plist watchdog interval "$ROOT" "" \
    "$(command -v python3)" -c 'import subprocess,sys;sys.exit(subprocess.call(["/bin/bash",sys.argv[1],"heal"]))' "$ROOT/deploy/deploy.sh"
}

start_svc() {  # bootstrap nếu chưa nạp, rồi kickstart
  loaded "$1" || launchctl bootstrap "gui/$UIDN" "$(plist "$1")"
  launchctl kickstart -k "gui/$UIDN/$(label "$1")"
}

# ---------- web ----------
web_server() {
  find "$WEB/.next/standalone" -name server.js -not -path '*/node_modules/*' 2>/dev/null | head -1
}

build_web() {
  cd "$WEB"
  [ -d node_modules ] || npm ci
  npm run build
  local server dir
  server="$(web_server)"
  [ -n "$server" ] || { echo "build không sinh .next/standalone/server.js" >&2; exit 1; }
  dir="$(dirname "$server")"
  mkdir -p "$dir/.next"
  rm -rf "$dir/.next/static" "$dir/public"
  cp -R .next/static "$dir/.next/static"
  cp -R public "$dir/public"
}

# ---------- tunnel ----------
write_tunnel_cfg() {
  cat > "$TUNNEL_CFG" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json
no-autoupdate: true
ingress:
  - hostname: $DOMAIN
    service: http://127.0.0.1:$WEB_PORT
  - hostname: lab.drakefamtax.id.vn
    service: http://127.0.0.1:$WEB_PORT
  - service: http_status:404
EOF
  cloudflared tunnel ingress validate --config "$TUNNEL_CFG" >/dev/null
}

# ---------- neo4j ----------
ensure_neo4j() {
  if ! docker info >/dev/null 2>&1; then
    log "docker chưa chạy, mở Docker Desktop"
    open -ga Docker || true
    for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 4; done
  fi
  docker info >/dev/null 2>&1 || { log "docker vẫn chưa sẵn sàng"; return 1; }
  local st
  st="$(docker inspect -f '{{.State.Health.Status}}' diabeque-neo4j-1 2>/dev/null || echo none)"
  if [ "$st" != healthy ]; then
    log "neo4j trạng thái '$st', bật lại"
    (cd "$ROOT" && docker compose up -d --wait neo4j) >>"$LOGS/heal.log" 2>&1 || return 1
    return 2   # neo4j vừa được dựng lại: api cần kết nối lại
  fi
}

# ---------- lệnh ----------
cmd_up() {
  [ -x "$ROOT/.venv/bin/python" ] || { echo "thiếu $ROOT/.venv (chạy make setup)" >&2; exit 1; }
  [ -f "$HOME/.cloudflared/$TUNNEL_ID.json" ] || { echo "thiếu credentials tunnel $TUNNEL_ID" >&2; exit 1; }
  ensure_neo4j || true
  build_web
  write_tunnel_cfg
  # Đổi CNAME của $DOMAIN sang tunnel này (ghi đè trỏ cũ).
  cloudflared tunnel route dns --overwrite-dns "$TUNNEL_ID" "$DOMAIN"
  write_all_plists
  # Process chạy tay trước đó (make api / make web) giữ cổng, phải dọn.
  pkill -f "uvicorn backend.app.main:app --port $API_PORT" 2>/dev/null || true
  lsof -tiTCP:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  sleep 1
  for s in "${SVCS[@]}"; do start_svc "$s"; done
  for _ in $(seq 1 30); do
    [ "$(code http://127.0.0.1:$API_PORT/ready)" = 200 ] && [ "$(code http://127.0.0.1:$WEB_PORT/)" != 000 ] && break
    sleep 2
  done
  cmd_status
}

cmd_rebuild() {
  build_web
  write_all_plists
  loaded web && launchctl bootout "gui/$UIDN/$(label web)" || true
  start_svc web
  sleep 3
  cmd_status
}

cmd_down() {
  for s in "${SVCS[@]}"; do loaded "$s" && launchctl bootout "gui/$UIDN/$(label "$s")" || true; done
  echo "đã gỡ 4 LaunchAgent; Neo4j vẫn chạy (docker compose stop để tắt)"
}

cmd_status() {
  for s in "${SVCS[@]}"; do printf '%-9s %s\n' "$s" "$(loaded "$s" && echo nạp || echo CHƯA-NẠP)"; done
  printf '%-9s %s\n' neo4j "$(docker inspect -f '{{.State.Health.Status}}' diabeque-neo4j-1 2>/dev/null || echo không-có)"
  printf '%-9s %s\n' "api" "$(curl -s -m 5 http://127.0.0.1:$API_PORT/ready || echo chết)"
  printf '%-9s %s\n' "web" "HTTP $(code http://127.0.0.1:$WEB_PORT/app/chat)"
  printf '%-9s %s\n' "public" "HTTP $(code https://$DOMAIN/app/chat)  https://$DOMAIN/"
}

cmd_heal() {
  mkdir -p "$LOGS"
  # lock đơn giản: tránh hai lượt heal chồng nhau khi docker chậm
  LOCK="$LOGS/heal.lock"
  if ! mkdir "$LOCK" 2>/dev/null; then
    [ -n "$(find "$LOCK" -mmin +10 2>/dev/null)" ] && rmdir "$LOCK" 2>/dev/null || true
    exit 0
  fi
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

  local restart_api=0 rc=0
  ensure_neo4j || rc=$?
  [ "$rc" = 2 ] && restart_api=1

  # LaunchAgent bị gỡ (logout, xóa tay) thì nạp lại; watchdog tự không nạp lại chính nó.
  for s in api web tunnel; do
    if ! loaded "$s"; then log "$s chưa nạp, nạp lại"; start_svc "$s"; fi
  done

  if [ "$restart_api" = 1 ] || [ "$(code http://127.0.0.1:$API_PORT/ready)" != 200 ]; then
    log "api không sẵn sàng, khởi động lại"; launchctl kickstart -k "gui/$UIDN/$(label api)"
    for _ in $(seq 1 20); do [ "$(code http://127.0.0.1:$API_PORT/ready)" = 200 ] && break; sleep 3; done
  fi

  if [ "$(code http://127.0.0.1:$WEB_PORT/app/chat)" != 200 ]; then
    log "web không trả 200, khởi động lại"; launchctl kickstart -k "gui/$UIDN/$(label web)"
    for _ in $(seq 1 10); do [ "$(code http://127.0.0.1:$WEB_PORT/app/chat)" = 200 ] && break; sleep 2; done
  fi

  # Local ổn mà ngoài vẫn lỗi thì lỗi nằm ở tunnel.
  if [ "$(code http://127.0.0.1:$WEB_PORT/app/chat)" = 200 ]; then
    local pub; pub="$(code "https://$DOMAIN/app/chat")"
    if [ "$pub" != 200 ]; then
      log "public HTTP $pub dù local ổn, khởi động lại tunnel"
      launchctl kickstart -k "gui/$UIDN/$(label tunnel)"
    fi
  fi
}

case "${1:-}" in
  up) cmd_up ;;
  heal) cmd_heal ;;
  status) cmd_status ;;
  rebuild) cmd_rebuild ;;
  down) cmd_down ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
