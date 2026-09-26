#!/usr/bin/env python3
"""운영 알림 전송기(ss-alert-watch.timer가 1분마다 실행).

~/.local/state/smartstore/alerts.jsonl의 새 줄을 읽어 자동화 웹훅으로 보낸다.
후속 워크플로가 팀 알림으로 전달한다. 보낸 위치(cursor)는 웹훅이 성공(2xx)으로 답할 때만 앞으로 옮긴다.
같은 종류 알림이 짧은 시간에 반복되면 묶어서 한 번만 보낸다(상태는 이 서버 파일에만, n8n에는 두지 않음).
"""
import json
import os
import pwd
import time
import urllib.request
from pathlib import Path

HOME = Path(pwd.getpwuid(os.getuid()).pw_dir)
STATE = HOME / ".local/state/smartstore"
ALERTS = STATE / "alerts.jsonl"
CURSOR = STATE / "alerts.cursor"
QUIET = STATE / "alerts.quiet.json"
WEBHOOK = os.environ.get("SS_ALERT_WEBHOOK", "http://127.0.0.1:5678/webhook/ss-alerts")
# 같은 종류(+계정) 알림을 다시 보내기까지 쉬는 시간(초). 목록에 없는 종류는 매번 보낸다.
QUIET_SECONDS = {"service_unhealthy": 1800, "quota_failover": 1800, "all_quota": 600, "naver_quiz": 1800, "run_failed": 600, "migration_run_failed": 600}
MAX_EVENTS = 30


def token():
    for line in (HOME / ".config/smartstore/secrets.env").read_text(encoding="utf-8").splitlines():
        if line.startswith("SS_ALERT_WEBHOOK_TOKEN="):
            return line.split("=", 1)[1].strip().strip("'\"")
    raise SystemExit("SS_ALERT_WEBHOOK_TOKEN 없음")


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def main():
    if not ALERTS.is_file():
        return
    offset = int(load_json(CURSOR, {"offset": 0}).get("offset", 0))
    size = ALERTS.stat().st_size
    if offset > size:  # 파일이 새로 만들어졌으면 처음부터
        offset = 0
    if offset == size:
        return
    with open(ALERTS, "rb") as f:
        f.seek(offset)
        chunk = f.read()
    end = chunk.rfind(b"\n") + 1  # 다 쓰인 줄까지만
    if end <= 0:
        return
    quiet = load_json(QUIET, {})
    now = time.time()
    events, held = [], 0
    for line in chunk[:end].decode("utf-8", "ignore").splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        key = f"{ev.get('kind')}:{ev.get('account') or ev.get('employee') or ''}"
        wait = QUIET_SECONDS.get(ev.get("kind"))
        entry = quiet.get(key, {"last": 0, "held": 0})
        if wait and now - entry["last"] < wait:
            entry["held"] += 1
            quiet[key] = entry
            held += 1
            continue
        if entry.get("held"):
            ev["text"] += f" (앞서 {entry['held']}건 더 있었음)"
        quiet[key] = {"last": now, "held": 0}
        events.append(ev)
    if events:
        body = json.dumps({"events": events[-MAX_EVENTS:], "dropped": max(0, len(events) - MAX_EVENTS)}, ensure_ascii=False).encode()
        req = urllib.request.Request(WEBHOOK, data=body, method="POST",
                                     headers={"Content-Type": "application/json", "X-SS-Token": token()})
        with urllib.request.urlopen(req, timeout=30) as res:  # 실패하면 예외 → cursor 그대로(다음 실행에 다시)
            if not 200 <= res.status < 300:
                raise SystemExit(f"n8n 응답 {res.status}")
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    CURSOR.write_text(json.dumps({"offset": offset + end, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}))
    QUIET.write_text(json.dumps(quiet))
    print(f"sent {len(events)}, held {held}")


if __name__ == "__main__":
    main()
