#!/usr/bin/env bash
# 5분마다 핵심 구성요소를 점검하고, 모두 정상일 때만 healthchecks.io에 신호를 보낸다.
# 신호가 끊기면(서버 다운 포함) healthchecks.io가 서버 밖에서 알린다. URL이 비어 있으면 점검 결과만 기록한다.
set -uo pipefail
fail=()
# Resources must be checked without PostgreSQL: disk exhaustion also breaks DB-based watchdogs.
export PGCONNECT_TIMEOUT=5
if resources=$(python3 "$HOME/smartstore-infra/bin/resource_health.py"); then
  while IFS= read -r component; do
    [[ -n "$component" ]] && fail+=("$component")
  done <<< "$resources"
else
  fail+=(resource-check)
fi
pg_isready -q -h 127.0.0.1 -p 5432 || fail+=(postgres)
curl -fsS -m 5 http://127.0.0.1:11435/health >/dev/null || fail+=(agy-proxy)
# Skyvern은 2026-10-06 제거(Z134).
curl -fsS -m 5 -o /dev/null http://127.0.0.1:5678/healthz || fail+=(n8n)
curl -fsS -m 5 -o /dev/null http://127.0.0.1:8090/accounts/login/ || fail+=(ss-web)
# 주문 조회(n8n 2분 예약 → poll_orders)가 10분 넘게 성공하지 못했으면 이상(15.3 하트비트). 조회를 아직 켜지 않았으면(기록 없음) 건너뜀
age=$(PGPASSWORD="${SMARTSTORE_DB_PASSWORD:-}" psql -h 127.0.0.1 -U smartstore_app -d smartstore -tAc "select extract(epoch from now()-last_success_at)::int from orders_pollstate where key='naver-orders'" 2>/dev/null | tr -d ' ')
[[ -n "$age" && "$age" -gt 600 ]] && fail+=("order-poll(${age}s)")
# 업무 경유 장치(SBC·노트북) 점검 — 서버 건강 판정(healthchecks.io)에는 넣지 않고 별도 알림만(sbc.md, ss-route-check)
"$HOME/smartstore-infra/bin/ss-route-check" >/dev/null 2>&1 || fail+=(route-monitor)
# 일일 백업은 Result뿐 아니라 타이머와 실제 최신 암호화 묶음(36시간 이내)을 함께 본다.
backup_result=$(systemctl --user show smartstore-backup.service -p Result --value 2>/dev/null || true)
backup_bad=$(python3 - "$HOME/backups/smartstore" <<'PY' 2>/dev/null || echo unreadable
import pathlib
import sys
import time

root = pathlib.Path(sys.argv[1])
archives = list(root.glob("smartstore-backup-*.tar.gpg"))
if not archives:
    print("missing")
    raise SystemExit
latest = max(archives, key=lambda path: path.stat().st_mtime)
age = time.time() - latest.stat().st_mtime
if not latest.is_file() or latest.stat().st_size <= 0:
    print("empty")
elif age < -300:
    print("future-time")
elif age > 36 * 3600:
    print(f"stale:{int(age // 3600)}h")
elif not pathlib.Path(f"{latest}.sha256").is_file():
    print("checksum-missing")
else:
    fields = pathlib.Path(f"{latest}.sha256").read_text(encoding="ascii").split()
    if len(fields) != 2 or len(fields[0]) != 64 or any(c not in "0123456789abcdefABCDEF" for c in fields[0]) or fields[1].lstrip("*") != latest.name:
        print("checksum-invalid")
PY
)
if [[ "$backup_result" != success ]]; then
  fail+=("backup(result:${backup_result:-unknown})")
elif ! systemctl --user is-active --quiet smartstore-backup.timer; then
  fail+=("backup(timer)")
elif [[ -n "$backup_bad" ]]; then
  fail+=("backup(${backup_bad})")
fi
# oneshot의 Result 기본값/오래된 success만으로는 "실제로 최근 복원했다"는 증거가 아니다.
# restore-test.sh가 성공한 뒤에만 쓰는 상태 파일의 성공 여부와 신선도도 확인한다.
restore_result=$(systemctl --user show smartstore-restore-test.service -p Result --value 2>/dev/null || true)
restore_test_bad=$(python3 - "$HOME/.local/state/smartstore/restore-test.json" <<'PY' 2>/dev/null || echo unreadable
import datetime
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    row = json.load(handle)
at = datetime.datetime.fromisoformat(row["at"])
age = datetime.datetime.now(at.tzinfo).timestamp() - at.timestamp()
if not row.get("ok"):
    print("failed")
elif age < -300:
    print("future-time")
elif age > 8 * 86400:
    print(f"stale:{int(age // 86400)}d")
PY
)
if [[ "$restore_result" != success ]]; then
  fail+=("restore_test(result:${restore_result:-unknown})")
elif ! systemctl --user is-active --quiet smartstore-restore-test.timer; then
  fail+=("restore_test(timer)")
elif [[ -n "$restore_test_bad" ]]; then
  fail+=("restore_test(${restore_test_bad})")
fi
# 업무 흐름 감시(ss-watchdog, 15분)가 45분 넘게 안 돌았으면 감시 공백(2026-10-06)
wd_bad=$(python3 - "$HOME/.local/state/smartstore/watchdog.json" <<'PY' 2>/dev/null || echo unreadable
import json
import sys
import time
with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)["last_ok"]
if isinstance(value, bool) or not isinstance(value, (int, float)):
    print("invalid")
else:
    age = time.time() - value
    if age < -300:
        print("future-time")
    elif age > 2700:
        print(f"stale:{int(age)}s")
PY
)
[[ -n "$wd_bad" ]] && fail+=("watchdog(${wd_bad})")
# 정기 일일 점검(ss-sec-audit-daily, 매일 04:20)이 36시간 넘게 결과를 못 남겼으면 점검 공백. weekly가 공용 last-run을 갱신해 daily 실패를 가리지 않도록 last-daily를 직접 본다.
sa_bad=$(python3 - "$HOME/smartstore-infra/security/state/last-daily.json" <<'PY' 2>/dev/null || echo unreadable
import datetime
import json
import sys
import time
with open(sys.argv[1], encoding="utf-8") as handle:
    at = datetime.datetime.fromisoformat(json.load(handle)["at"])
age = time.time() - at.timestamp()
if age < -300:
    print("future-time")
elif age > 129600:
    print(f"stale:{int(age)}s")
PY
)
[[ -n "$sa_bad" ]] && fail+=("sec-audit(${sa_bad})")
# 스토어 리뷰 수 읽기(2026-10-29, ss-store-reviews 30분마다): 3시간 넘게 회차 기록이 없거나 마지막 회차가 전부 못 읽음이면 — 판매중지/품절 판단이 멈춤
rv_bad=$(python3 - "$HOME/.local/state/smartstore/store-reviews-run.json" <<'PY' 2>/dev/null || echo unreadable
import datetime
import json
import sys
import time
with open(sys.argv[1], encoding="utf-8") as handle:
    d = json.load(handle)
age = time.time() - datetime.datetime.fromisoformat(d["at"]).timestamp()
if age > 10800:
    print(f"stale:{int(age)}s")
elif d.get("fail") and not d.get("done"):
    print(f"read-failed:{d['fail']}")
PY
)
[[ -n "$rv_bad" ]] && fail+=("store-reviews(${rv_bad})")
# 프로세스 탭 1분 기록(ss-hub-proc, Z448): 10분 넘게 안 쌓이면 추이 그래프와 '정체 모를 프로세스·공격 흔적 → Alex 인계'가 함께 멈춘다
hp_age=$(( $(date +%s) - $(stat -c %Y "$HOME/.local/state/smartstore/hub/proc-history.jsonl" 2>/dev/null || echo 0) ))
[[ "$hp_age" -gt 600 ]] && fail+=("hub-proc(stale:${hp_age}s)")
# daily 성공이 계속돼도 주간 전체 YARA·Sigma·SUID/패키지 점검 누락을 가리지 못하게 별도 감시한다.
weekly_path="$HOME/smartstore-infra/security/state/last-weekly.json"
weekly_trigger=$(systemctl --user show ss-sec-audit-weekly.timer -p LastTriggerUSec --value 2>/dev/null || true)
weekly_state=$(systemctl --user show ss-sec-audit-weekly.service -p ActiveState --value 2>/dev/null || true)
if [[ "$weekly_state" == active || "$weekly_state" == activating ]]; then
  : # 전체 스캔이 실행 중인 동안은 결과 파일을 기다린다(oneshot은 실행 중 'activating' — 2026-11-01 첫 주간 스캔 중 오경보).
elif [[ -f "$weekly_path" ]]; then
  sw_bad=$(python3 - "$weekly_path" <<'PY' 2>/dev/null || echo unreadable
import datetime
import json
import sys
import time
with open(sys.argv[1], encoding="utf-8") as handle:
    at = datetime.datetime.fromisoformat(json.load(handle)["at"])
age = time.time() - at.timestamp()
if age < -300:
    print("future-time")
elif age > 691200:
    print(f"stale:{int(age)}s")
PY
)
  [[ -n "$sw_bad" ]] && fail+=("sec-weekly(${sw_bad})")
elif [[ -n "$weekly_trigger" && "$weekly_trigger" != n/a ]]; then
  fail+=("sec-weekly(missing-after-trigger)")
fi
# 보안 일정이 꺼지면 다음 결과 시각을 기다리지 않고 5분 하트비트에서 확인한다. 두 번 연속 실패해야 알린다.
security_timers=(ss-sec-audit-daily.timer ss-sec-audit-weekly.timer ss-sec-test.timer ss-sec-relay.timer ss-sec-oci-audit.timer ss-geo-update.timer ss-blocklist-update.timer smartstore-heartbeat.timer)
stopped_timers=()
for unit in "${security_timers[@]}"; do
  systemctl --user is-active --quiet "$unit" || stopped_timers+=("${unit%.timer}")
done
(( ${#stopped_timers[@]} )) && fail+=("security-schedule(${stopped_timers[*]})")
# 타이머가 켜져 있어도 마지막 작업이 실패할 수 있다. oneshot 서비스 Result를 따로 확인한다.
security_jobs=(ss-sec-audit-daily.service ss-sec-audit-weekly.service ss-sec-test.service ss-sec-relay.service ss-sec-oci-audit.service ss-geo-update.service ss-blocklist-update.service)
failed_security_jobs=()
for unit in "${security_jobs[@]}"; do
  result=$(systemctl --user show "$unit" -p Result --value 2>/dev/null || true)
  [[ -z "$result" || "$result" == success ]] || failed_security_jobs+=("${unit%.service}")
done
(( ${#failed_security_jobs[@]} )) && fail+=("security-job(${failed_security_jobs[*]})")
# ss-sec-test.service 는 규칙 시험 실패(exit 1)를 systemd 성공으로 처리하므로, 결과 JSON을 직접 확인한다.
security_test_bad=$(python3 - "$HOME/smartstore-infra/security/state/last-test.json" <<'PY' 2>/dev/null || echo unreadable
import datetime
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    row = json.load(f)
at = datetime.datetime.fromisoformat(row["at"])
age = datetime.datetime.now(at.tzinfo).timestamp() - at.timestamp()
if not row.get("ok"):
    print("failed")
elif age < -300:
    print("future-time")
elif age > 8 * 86400:
    print(f"stale:{int(age // 86400)}d")
PY
)
[[ -n "$security_test_bad" ]] && fail+=("security-test(${security_test_bad})")
# Hermes의 Alex 정기 판독은 systemd 타이머와 별개다. 같은 보안 작업이 2회 이상 연속 실패하면 숨기지 않는다.
alex_bad=$(python3 - "$HOME/.hermes/profiles/infra-ops/cron/jobs.json" <<'PY' 2>/dev/null || echo unreadable
import datetime
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
rows = data.get("jobs", data) if isinstance(data, dict) else data
rows = rows.values() if isinstance(rows, dict) else rows
required = {"보안·일일 판독", "보안·주간 검토", "보안·월간 위생", "보안·웹 노출", "보안·분기 훈련"}
by_name = {}
for job in rows:
    name = str(job.get("name", ""))
    if name in required:
        if name in by_name:
            by_name[name] = None
        else:
            by_name[name] = job
bad = []
now = datetime.datetime.now().astimezone()
for name in sorted(required):
    job = by_name.get(name)
    short = name.replace("보안·", "")
    if not isinstance(job, dict):
        bad.append(f"{short}:missing-or-duplicate")
        continue
    if job.get("enabled") is not True or job.get("state") != "scheduled":
        bad.append(f"{short}:disabled")
        continue
    try:
        next_run = datetime.datetime.fromisoformat(job["next_run_at"])
    except (KeyError, TypeError, ValueError):
        bad.append(f"{short}:next-run-invalid")
        continue
    if next_run.tzinfo is None or next_run < now - datetime.timedelta(minutes=10):
        bad.append(f"{short}:next-run-overdue")
        continue
    streak = int(job.get("failure_streak") or 0)
    if streak >= 2:
        bad.append(f"{short}:{streak}")
print(",".join(bad))
PY
)
[[ -n "$alex_bad" ]] && fail+=("alex-security-cron(${alex_bad})")
# 보안 정본·보고 폴더와 relay의 미해결 보관 오류를 확인한다. 원시 로그나 비밀값은 OneDrive에 쓰지 않는다.
archive_bad=()
mount_info=$(findmnt -rn -T "$HOME/OneDrive/Security" -o FSTYPE,SOURCE 2>/dev/null || true)
[[ "$mount_info" == "fuse.rclone onedrive:" ]] || archive_bad+=(mount)
systemctl is-active --quiet rclone-onedrive.service || archive_bad+=(rclone-service)
[[ -r "$HOME/OneDrive/Security/02_공격징후·사고대응/공격.md" ]] || archive_bad+=(incident)
[[ -d "$HOME/OneDrive/Security/01_Alex-정기보고/자동점검" && -w "$HOME/OneDrive/Security/01_Alex-정기보고/자동점검" ]] || archive_bad+=(audit-report)
[[ -d "$HOME/OneDrive/Security/01_Alex-정기보고/AI판독" && -w "$HOME/OneDrive/Security/01_Alex-정기보고/AI판독" ]] || archive_bad+=(alex-report)
archive_errors=$(python3 - "$HOME/smartstore-infra/security/state/relay.json" <<'PY' 2>/dev/null || echo state-unreadable
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
bad = [key for key, row in data.get("done", {}).items() if row.get("archive_error") and not row.get("archive")]
print(len(bad) if bad else "")
PY
)
[[ -n "$archive_errors" ]] && archive_bad+=("relay:${archive_errors}")
slack_thread_bad=$(python3 - \
  "$HOME/smartstore-infra/security/state/last-slack-daily.json" \
  "$HOME/smartstore-infra/security/state/last-slack-weekly.json" \
  "$HOME/smartstore-infra/security/state/last-weekly.json" <<'PY' 2>/dev/null || echo state-unreadable
import datetime
import json
import os
import sys

bad = []
for path in sys.argv[1:3]:
    if not os.path.exists(path):
        continue
    with open(path, encoding="utf-8") as f:
        row = json.load(f)
    if row.get("thread_ok") is False:
        bad.append(f"{row.get('mode', 'unknown')}-detail-thread")
weekly_result, weekly_slack = sys.argv[3], sys.argv[2]
if os.path.exists(weekly_result):
    if not os.path.exists(weekly_slack):
        bad.append("weekly-root-missing")
    else:
        with open(weekly_result, encoding="utf-8") as f:
            result = json.load(f)
        with open(weekly_slack, encoding="utf-8") as f:
            slack = json.load(f)
        try:
            delta = abs((datetime.datetime.fromisoformat(result["at"]) - datetime.datetime.fromisoformat(slack["at"])).total_seconds())
        except (KeyError, TypeError, ValueError):
            delta = 999999
        if slack.get("mode") != "weekly" or not slack.get("root_ts") or delta > 5:
            bad.append("weekly-root-mismatch")
print(",".join(bad))
PY
)
if ! rclone_security=$("$HOME/smartstore-infra/bin/rclone_security_health.py" 2>/dev/null); then
  archive_bad+=("${rclone_security:-rclone-upload-check}")
elif [[ -n "$rclone_security" ]]; then
  archive_bad+=("$rclone_security")
fi
(( ${#archive_bad[@]} )) && fail+=("security-archive(${archive_bad[*]})")
[[ -n "$slack_thread_bad" ]] && fail+=("security-slack(${slack_thread_bad})")
# 탐지·차단 핵심 서비스가 멈춘 경우도 일일 점검까지 기다리지 않는다.
security_units=(nginx fail2ban ss-honeypot suricata osqueryd)
stopped_units=()
for unit in "${security_units[@]}"; do
  systemctl is-active --quiet "$unit" || stopped_units+=("$unit")
done
(( ${#stopped_units[@]} )) && fail+=("security-enforcement(${stopped_units[*]})")
# 판정·알림 문구는 heartbeat_alert.py: 한 번 실패는 기록만, 2회 연속(약 10분)이면 구체적 알림, 돌아오면 회복 알림
if ! "$HOME/smartstore-infra/bin/heartbeat_alert.py" "${fail[@]}"; then
  echo "unhealthy(확정): ${fail[*]}"
  [[ -n "${HEALTHCHECK_HEARTBEAT_URL:-}" ]] && curl -fsS -m 10 --data-raw "unhealthy: ${fail[*]}" "$HEALTHCHECK_HEARTBEAT_URL/fail" >/dev/null
  exit 1
fi
[[ -n "${HEALTHCHECK_HEARTBEAT_URL:-}" ]] && curl -fsS -m 10 --retry 3 "$HEALTHCHECK_HEARTBEAT_URL" >/dev/null
if (( ${#fail[@]} )); then echo "1차 실패(확인 대기): ${fail[*]}"; else echo "healthy"; fi
