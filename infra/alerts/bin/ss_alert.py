#!/usr/bin/env python3
"""운영 알림 사건을 한 파일에 한 줄씩 남긴다. 전송은 ss_alert_watch.py가 자동화 웹훅으로 담당한다.

사건을 남기는 쪽은 n8n이 꺼져 있어도 멈추지 않는다(파일에 쓰기만 한다).
비밀번호·토큰·인증번호·게임 키·고객 정보는 넣지 않는다.

사용(셸): ss_alert.py <kind> <severity> "<내용>" [key=value ...]
  severity: info / warn / urgent
사용(파이썬): from ss_alert import emit; emit("quota_failover", "warn", "…", account="primary")
"""
import json
import os
import pwd
import sys
import time
from pathlib import Path

# agy는 HOME을 계정 폴더로 바꾸므로 실제 홈은 pwd로 찾는다
STATE = Path(pwd.getpwuid(os.getuid()).pw_dir) / ".local/state/smartstore"
ALERTS = STATE / "alerts.jsonl"
SEVERITIES = ("info", "warn", "urgent")


def emit(kind, severity, text, **fields):
    try:
        STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
        event = {"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "kind": kind,
                 "severity": severity if severity in SEVERITIES else "warn", "text": str(text)[:1000]}
        event.update({k: v for k, v in fields.items() if v is not None})
        line = json.dumps(event, ensure_ascii=False) + "\n"
        fd = os.open(ALERTS, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, line.encode("utf-8"))  # 한 번의 append 쓰기(여러 프로세스가 동시에 써도 줄이 섞이지 않음)
        finally:
            os.close(fd)
    except OSError:
        pass  # 알림 기록 실패로 업무를 멈추지 않는다


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    extra = dict(arg.split("=", 1) for arg in sys.argv[4:] if "=" in arg)
    emit(sys.argv[1], sys.argv[2], sys.argv[3], **extra)
