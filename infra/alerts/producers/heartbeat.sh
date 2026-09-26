#!/usr/bin/env bash
# 5분마다 핵심 구성요소를 점검하고, 모두 정상일 때만 외부 상태 확인 서비스에 신호를 보낸다.
# 신호가 끊기면(서버 다운 포함) 외부 상태 확인 서비스가 서버 밖에서 알린다.
set -uo pipefail
fail=()
pg_isready -q -h 127.0.0.1 -p 5432 || fail+=(postgres)
curl -fsS -m 5 http://127.0.0.1:11435/health >/dev/null || fail+=(agy-proxy)
curl -fsS -m 5 http://127.0.0.1:8000/api/v1/heartbeat >/dev/null || fail+=(skyvern)
curl -fsS -m 5 -o /dev/null http://127.0.0.1:5678/healthz || fail+=(n8n)
curl -fsS -m 5 -o /dev/null http://127.0.0.1:8090/accounts/login/ || fail+=(ss-web)
if (( ${#fail[@]} )); then
  echo "unhealthy: ${fail[*]}"
  "$HOME/smartstore-infra/bin/ss_alert.py" service_unhealthy urgent "5분 점검 이상: ${fail[*]} (n8n이 죽었으면 살아난 뒤 전달됨)"
  [[ -n "${HEALTHCHECK_HEARTBEAT_URL:-}" ]] && curl -fsS -m 10 --data-raw "unhealthy: ${fail[*]}" "$HEALTHCHECK_HEARTBEAT_URL/fail" >/dev/null
  exit 1
fi
[[ -n "${HEALTHCHECK_HEARTBEAT_URL:-}" ]] && curl -fsS -m 10 --retry 3 "$HEALTHCHECK_HEARTBEAT_URL" >/dev/null
echo "healthy"
