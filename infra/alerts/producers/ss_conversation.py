#!/usr/bin/env python3
"""Smartstore 직원 공통 대화 엔진: 직원 1명 = agy 영구 대화 1개 (Slack·Claw3D 공유).

출처: orca/workspaces/EDU/Blog/scripts/alex_conversation.py (2026-09-24 복사).
agy HTTP 프록시는 이력을 버리므로 같은 계정의 native 프로토콜을 --conversation으로 이어서 쓴다.
"""
import argparse
import fcntl
import json
import re
import os
import pwd
from pathlib import Path
import selectors
import signal
import sqlite3
import subprocess
import sys
import time

WORKSPACE = Path(os.environ.get("SS_WORKSPACE", Path(__file__).resolve().parents[1]))
STATE_DIR = Path(os.environ.get("SS_RUNTIME_DIR", WORKSPACE / "session" / "conversation"))
AGENT_BIN = os.environ.get("SS_AGENT_BIN", "/home/ubuntu/.local/bin/agy-11")
ACCOUNT = None  # agy 대화 ID는 계정별이다. 계정이 바뀌면 새 대화를 시작한다.
SLASH_COMMANDS = False  # 전용 브라우저가 있는 직원만 켠다(/browser 하위 에이전트)
MODEL = os.environ.get("SS_MODEL", "gemini-3.8-flash-high")
HEARTBEAT = float(os.environ.get("SS_HEARTBEAT_SECONDS", "20"))
RESULT_GRACE = 30   # 최종 결과를 받은 뒤 agy가 스스로 끝나기를 기다리는 초
RUN_LIMIT_SECONDS = 3000   # 2026-11-05 사용자 지시: 실행 1회 제한 전 사원 50분 통일(drop-in·기본값·지휘본부·CTO 모두 이 값)
TIMEOUT = float(os.environ.get("SS_RUN_TIMEOUT_SECONDS", str(RUN_LIMIT_SECONDS)))
# 2026-11-05 사용자 지시 "작업이 남아있으면 제한을 풀게": 50분이 지나도 최근 15분 안에 출력(모델 응답·도구 진행)이 있으면 계속 둔다.
# 50분이 지났고 15분 동안 아무 출력이 없을 때만 멈춘 것으로 보고 끊는다. agy 자체 제한(--print-timeout)은 0(턴이 끝날 때까지)으로.
IDLE_KILL = 15 * 60


def past_limit(now, started, last_activity):
    return now - started > TIMEOUT + 10 and now - last_activity > IDLE_KILL
AGENT_MODE = "plan"
OUTPUT_SCHEMA = None
REFUSED = re.compile(r"plan 모드|읽기[·・ ]*계획 모드|실행 권한(?:이|은)? 없|권한이 없어")
USER_DIRECTED = None   # ss_runtime이 넣는 판별 함수: 사용자가 Slack으로 직접 보낸 지시면 그 실행만 accept-edits(2026-10-26 사용자, Z339)


def emit(event, **fields):
    print(json.dumps({"event": event, **fields}, ensure_ascii=False), flush=True)


def connect_store():
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(STATE_DIR / "runtime.sqlite3", timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS runs (
            request_id TEXT PRIMARY KEY, source TEXT, user_text TEXT,
            status TEXT, started_at REAL, updated_at REAL,
            conversation_id TEXT, answer TEXT, error TEXT
        );
    """)
    return db


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


KEEP_CONVERSATION = True   # 정기 업무(schedule:)는 매번 새 대화로 돌고 저장하지 않는다(2026-10-09)
# 매번 새 대화로 도는 자동 작업(지시문만으로 완결). 감시 conv_reuse_auto가 이 목록의 두 실행이 같은 대화를 쓰면 알린다(Z414)
EPHEMERAL_PREFIXES = ("schedule:", "cto:", "cto-approve:", "audit:", "report:", "widen:", "market-candidate-retry:", "regress:", "market-code:", "allow-ai:")
CONV_MAX_BYTES = 8 * 1024 * 1024


def account_dir(agent_bin=None):
    m = re.search(r"agy-isolated\s+\\?\s*(\S+@\S+?)\s", Path(agent_bin or AGENT_BIN).read_text(errors="ignore"))
    return Path(m.group(1)) if m else None


def conversation_too_big(conversation_id):
    """agy 대화 파일이 커지면 끝 답변 단계에서 ERROR로 끝난다(2026-10-09 Noah 25회·22MB: 일은 하고 결과만 실패) → 새 대화로."""
    try:
        return (account_dir() / ".gemini/antigravity-cli/conversations" / f"{conversation_id}.db").stat().st_size > CONV_MAX_BYTES
    except (OSError, TypeError):
        return False


COPILOT_CONV_MAX_RUNS = 12


# 2026-11-04: 주문팀(Emma 주문 확인·James 이행·발송)은 주문마다 같은 대화에 이어 붙어 4일 만에 실행 한 번이 19만 → 80만~110만 토큰,
# 평소 12분이던 주문 #44가 38분(응답 사이 1~3분, 혼잡 때 멈춤도 잦음). 주문은 서로 독립 — 같은 주문의 후속 작업(클레임·이행 보충)만 같은 대화를 잇는다.
ORDER_SCOPED = ("order:", "fulfill:", "delivery:")
CONV_KEY = None   # 이번 실행의 주문 단위 키(예: fulfill:2026…) — 주문 단위가 아닌 실행(슬랙 답장 등)은 None이라 기존 대화·키를 그대로 둔다


def order_key(item):
    rid = str(item.get("request_id", ""))
    return ":".join(rid.split(":")[:2]) if rid.startswith(ORDER_SCOPED) else None


def save_conversation(db, conversation_id):
    if not KEEP_CONVERSATION:
        return
    meta = dict(db.execute("SELECT key, value FROM metadata").fetchall())
    runs = int(meta.get("conv_runs") or 0) + 1 if meta.get("conversation_id") == conversation_id else 1
    db.execute("INSERT OR REPLACE INTO metadata VALUES ('conv_runs', ?)", (str(runs),))
    if CONV_KEY:
        db.execute("INSERT OR REPLACE INTO metadata VALUES ('conv_key', ?)", (CONV_KEY,))
    db.execute("INSERT OR REPLACE INTO metadata VALUES ('conversation_id', ?)", (conversation_id,))
    db.execute("INSERT OR REPLACE INTO metadata VALUES ('account', ?)", (ACCOUNT,))


def resume_or_recap(db, item):
    """같은 계정의 대화 ID를 돌려준다. 없으면 최근 기록을 item에 담아 새 대화가 맥락을 잇게 한다."""
    global CONV_KEY
    meta = dict(db.execute("SELECT key, value FROM metadata").fetchall())
    CONV_KEY = order_key(item)
    other_order = CONV_KEY is not None and meta.get("conv_key") != CONV_KEY   # 다른 주문이면 새 대화(최근 기록 요약만 넘김)
    # Copilot(Hermes) 대화는 파일 크기를 볼 수 없어 이어 쓴 횟수로 자른다(2026-10-14 Ethan 대화가 8일 쌓여 모든 실행 실패)
    copilot_full = MODEL.startswith("copilot:") and int(meta.get("conv_runs") or 0) >= COPILOT_CONV_MAX_RUNS
    if meta.get("conversation_id") and meta.get("account") == ACCOUNT and not conversation_too_big(meta["conversation_id"]) and not copilot_full and not other_order:
        return meta["conversation_id"]
    if CONV_KEY:   # 주문 단위 실행은 같은 주문의 기록만 넘긴다(다른 주문 내용이 섞이지 않게)
        rows = db.execute("SELECT user_text, answer FROM runs WHERE status='completed' AND (request_id = ? OR request_id LIKE ?) "
                          "ORDER BY started_at DESC LIMIT 6", (CONV_KEY, CONV_KEY + ":%")).fetchall()
    else:
        rows = db.execute("SELECT user_text, answer FROM runs WHERE status='completed' "
                          "ORDER BY started_at DESC LIMIT 6").fetchall()
    item["recent_turns"] = [{"user": r["user_text"][-1500:], "assistant": r["answer"][-1500:]} for r in reversed(rows)]
    return None


PROMPT_ARG_LIMIT = 100_000   # 바이트. 리눅스 명령 인자 하나의 한도는 128KB(MAX_ARG_STRLEN) — 넘으면 실행 자체가 거부된다


def spill_prompt(prompt, item):
    """지시문이 너무 길면 파일로 넘기고 '먼저 읽어라'는 짧은 지시로 바꾼다(2026-10-12: 회귀 시험 지시문 153KB → 실행 거부 'agent_failed').
    파일은 사원 작업 폴더 session/prompts/(0600), 7일 지나면 지운다."""
    size = len(prompt.encode("utf-8"))
    if size <= PROMPT_ARG_LIMIT:
        return prompt
    d = WORKSPACE / "session" / "prompts"
    d.mkdir(parents=True, exist_ok=True)
    now = time.time()
    for old in d.glob("*.md"):
        try:
            if now - old.stat().st_mtime > 7 * 86400:
                old.unlink()
        except OSError:
            pass
    rid = re.sub(r"[^0-9A-Za-z._-]", "_", str(item.get("request_id") or "request"))[:80]
    f = d / f"{rid}-{int(now)}.md"
    f.write_text(prompt, encoding="utf-8")
    os.chmod(f, 0o600)
    return (f"이번 작업 지시문이 길어({size // 1024}KB) 파일로 넘깁니다. **먼저 `cat {f}` 로 파일 전체를 읽고, 그 안의 지시를 그대로 수행하세요.** "
            "파일 내용이 이 작업의 전체 지시이며, 이 문장 말고 다른 지시는 없습니다.")


def build_prompt(item):
    raise RuntimeError("prompt must be configured by ss_runtime")


def stop_process(proc):
    """실행 묶음(프로세스 그룹) 전체를 끝낸다. 2026-10-21 Ethan 시험: 실행 파일은 끝났는데 agy 본체가 SIGTERM 뒤
    'Waiting for migrations'에서 멈춰 고아로 남았다(묶음 대표만 확인하고 끝냈기 때문) → 묶음에 남은 게 있으면 5초 뒤 SIGKILL."""
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(proc.pid, 0)
        except ProcessLookupError:
            break   # 묶음에 남은 프로세스 없음
        try:
            os.killpg(proc.pid, sig)
        except ProcessLookupError:
            break
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            proc.poll()
            try:
                os.killpg(proc.pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.2)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


TOOL_LABELS = {
    "view_file": "파일 내용을 확인하고 있습니다.",
    "list_dir": "작업 파일을 확인하고 있습니다.",
    "grep_search": "관련 내용을 검색하고 있습니다.",
    "run_command": "작업 명령을 실행하고 있습니다.",
    "command_status": "실행 결과를 확인하고 있습니다.",
    "write_to_file": "작업 파일을 작성하고 있습니다.",
    "replace_file_content": "작업 파일을 수정하고 있습니다.",
    "multi_replace_file_content": "작업 파일을 수정하고 있습니다.",
    "search_web": "관련 자료를 확인하고 있습니다.",
    "read_url_content": "웹 페이지를 확인하고 있습니다.",
    "subagent": "브라우저로 판매자센터 작업을 하고 있습니다.",
}


def alert(kind, severity, text, **fields):
    """운영 알림(ss_alert → n8n → Mason Slack). 실패해도 업무는 계속한다."""
    try:
        import pwd as _pwd  # agy가 아닌 이 프로세스는 실제 홈이지만, 안전하게 pwd로 찾는다
        sys.path.insert(0, str(Path(_pwd.getpwuid(os.getuid()).pw_dir) / "smartstore-infra/bin"))
        from ss_alert import emit
        emit(kind, severity, text, employee=WORKSPACE.name.replace("workspace-", ""), **fields)
    except Exception:
        pass


QUOTA_PATTERN = re.compile(r"RESOURCE_EXHAUSTED|quota reached|rate.?limit|too many requests|\b429\b", re.I)
LOG_QUOTA = re.compile(r"RESOURCE_EXHAUSTED|Individual quota reached")
# 2026-10-20 01:40~: Gemini 서버 혼잡(503 No capacity)·응답 정지(stream idle timeout)로 Emma 주문 확인이 15분씩 멈춰 이행 인계가 막힘
LOG_BUSY = re.compile(r"No capacity available|UNAVAILABLE \(code 503\)|stream idle timeout")
# 실행 도중 끊는 기준(2026-10-20): agy는 503을 스스로 다시 시도해 첫 번째·두 번째에서 절반씩 풀린다(10-19~20 기록: 1회 30건 → 2회 15 → 3회 8 → 4~8회 7).
# 세 번째 재시도까지 실패하거나 응답이 멈췄을 때만 계정을 바꾼다 — 첫 503에서 끊으면 풀릴 작업(Noah 2시간 관측 등)을 처음부터 다시 하게 된다.
LOG_BUSY_LIVE = re.compile(r"attempt (?:[3-9]|[1-9]\d+) failed \(UNAVAILABLE \(code 503\)|stream idle timeout")
# 주문팀(주문 확인·이행·발송)은 속도가 먼저(평소 12분, 2026-11-04 주문 #44가 혼잡으로 38분) — 사용자 지시 "혼잡 판정 1초마다, 판정되면 바로 정상 계정으로,
# 주문은 끝까지 처리": 첫 503에서 바로 전환, 오류 없는 계정부터, 풀을 다 돌아도 혼잡이면 1시간까지 계속 돈다. 다시 실행은 처음부터가 아니라
# 기록된 단계부터 이어서(ORDER_RESUME_NOTE) — 중복 처리는 ss-fulfill start 거부(진행 중 기록)·unknown 중복 실행 금지가 막는다.
LOG_BUSY_ORDER = re.compile(r"attempt \d+ failed \(UNAVAILABLE \(code 503\)|stream idle timeout")
ORDER_BUSY_CHECK = 1        # 초 — 주문팀 혼잡 판정 간격(다른 사원 30초)
BUSY_RECENT = 600           # 초 — 이 안에 503·응답 정지가 찍힌 계정은 전환 순서 맨 뒤
ORDER_RETRY_FOR = 3600      # 초 — 주문팀은 풀을 다 돌아도 혼잡이면 이만큼 계속 다시(바퀴 사이 10초)
ORDER_RESUME_NOTE = ("⚠️ 앞 실행이 Gemini 서버 혼잡으로 중간에 끊겨 다른 계정으로 이어서 합니다. 처음부터 다시 하지 말고, 먼저 이 주문의 현재 상태"
                     "(`ss-order show`, 이행 기록: 이행 시작·처리·키 준비·메일·발송)를 확인해 끝나지 않은 단계부터 끝까지 처리하세요. "
                     "이미 처리된 건은 다시 처리하지 않고, 이미 보낸 메일은 다시 보내지 않습니다.\n\n")
LOG_LINE_AT = re.compile(r"^[IWEF](\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})")
AGENT_BIN_FOR = None        # ss_runtime이 넣는 함수: 계정 → 실행 파일(그 계정 로그 폴더를 찾는 데 쓴다)
# 2026-11-04 14:24~: 계정 88 Gemini가 오류 없이 응답 1분 반~4분 간격(평소 5~10초) — 503이 아니라 전환이 안 돼 Emma 7분·Leo 8분+ 정체.
# 주문팀은 도구 실행 중이 아닌데 모델 출력이 60초 넘게 없으면 '느림'으로 보고 바로 다른 계정으로, 그 계정은 10분 동안 시작 계정에서도 뺀다.
ORDER_SLOW_SEC = 60
# 2026-11-05: Lucas(이행 계정 점검) 아침 정기 점검이 계정 88에서 3번 15분 시간 제한(99에선 3분 22초) — 주문 요청만 보던 느림·혼잡 판정을
# 주문팀 사원의 모든 작업으로 넓힌다(1시간 계속 다시 돌기는 주문 요청만)
FAST_TEAM = ("ss-order-watch", "ss-fulfill-main", "ss-fulfill-backup", "ss-delivery", "ss-fulfill-monitor")


def fast_team():
    return WORKSPACE is not None and WORKSPACE.name.replace("workspace-", "") in FAST_TEAM
SLOW_ACCOUNTS = Path.home() / ".local/state/smartstore/slow-accounts.json"


def mark_slow(account):
    try:
        d = json.loads(SLOW_ACCOUNTS.read_text()) if SLOW_ACCOUNTS.exists() else {}
    except (OSError, ValueError):
        d = {}
    d[str(account)] = time.time()
    try:
        SLOW_ACCOUNTS.write_text(json.dumps(d))
    except OSError:
        pass


SLOW_RECENT = 1800   # 초 — '느림'으로 본 계정은 30분 동안 주문팀 시작·전환 순서 맨 뒤(11-04 계정 88은 30분 넘게 계속 느렸다)


def recently_slow(account, within=SLOW_RECENT, now=None):
    try:
        return (now or time.time()) - float(json.loads(SLOW_ACCOUNTS.read_text()).get(str(account), 0)) <= within
    except (OSError, ValueError, TypeError):
        return False


def tool_running(root_pid):
    """agy 본체(antigravity-bin) 아래에 도구 프로세스(ss-browse·ss-order 등)가 돌고 있는지 — 도구 실행 시간은 '느림'이 아니다."""
    kids = {}
    for d in Path("/proc").iterdir():
        if d.name.isdigit():
            try:
                kids.setdefault(int((d / "stat").read_text().rsplit(")", 1)[1].split()[1]), []).append(int(d.name))
            except (OSError, ValueError, IndexError):
                pass
    todo, seen = [root_pid], set()
    while todo:
        pid = todo.pop()
        if pid in seen:
            continue
        seen.add(pid)
        try:
            cmd = (Path("/proc") / str(pid) / "cmdline").read_bytes()
        except OSError:
            cmd = b""
        if b"antigravity-bin" in cmd and kids.get(pid):
            return True
        todo.extend(kids.get(pid, []))
    return False


def account_log_quota(since):
    """하위 에이전트(/browser)의 429는 CLI 출력에 안 나오고 '빈 응답'으로 끝난다(2026-10-08 Mia) —
    이 실행 뒤 생긴 계정 로그(~/.agy/accounts/<이메일>/.gemini/antigravity-cli/log)에서 사용량 한도를 찾는다."""
    try:
        m = re.search(r"agy-isolated\s+\\?\s*(\S+@\S+?)\s", Path(AGENT_BIN).read_text(errors="ignore"))
        logdir = Path(m.group(1)) / ".gemini/antigravity-cli/log"
        for f in logdir.glob("cli-*.log"):
            if f.stat().st_mtime >= since and LOG_QUOTA.search(f.read_text(errors="ignore")[-300000:]):
                return True
    except (OSError, AttributeError):
        pass
    return False
def own_agent_logs(root_pid):
    """이 실행이 띄운 agy 프로세스가 연 계정 로그(cli-*.log)만 — 같은 계정을 쓰는 다른 사원의 503으로 이 작업을 끊지 않게(2026-10-20)."""
    children, logs = {}, set()
    for d in Path("/proc").iterdir():
        if d.name.isdigit():
            try:
                children.setdefault(int((d / "stat").read_text().rsplit(")", 1)[1].split()[1]), []).append(int(d.name))
            except (OSError, ValueError, IndexError):
                pass
    todo, seen = [root_pid], set()
    while todo:
        pid = todo.pop()
        if pid in seen:
            continue
        seen.add(pid)
        todo.extend(children.get(pid, []))
        try:
            for fd in (Path("/proc") / str(pid) / "fd").iterdir():
                target = os.readlink(fd)
                if "/antigravity-cli/log/cli-" in target and target.endswith(".log"):
                    logs.add(target)
        except OSError:
            pass
    return logs


def account_log_busy(logs, pattern=None):
    """이 실행의 계정 로그에 agy 자체 재시도로도 안 풀린 Gemini 서버 혼잡(503 3회째 이상)·응답 정지가 찍혔는지."""
    for f in logs:
        try:
            if (pattern or LOG_BUSY_LIVE).search(Path(f).read_text(errors="ignore")[-300000:]):
                return True
        except OSError:
            pass
    return False


def recently_busy(account, within=BUSY_RECENT, now=None):
    """그 계정 로그에 최근 10분 안 Gemini 503·응답 정지가 찍혔는지(줄 앞 시각으로 판정) — 전환할 때 오류 없는 계정부터 고르려고."""
    if not AGENT_BIN_FOR:   # 운영 실행기(ss_runtime)가 연결하지 않은 실행(시험 등)은 운영 상태 파일을 보지 않는다
        return False
    now = now or time.time()
    if recently_slow(account, now=now):
        return True
    try:
        logdir = account_dir(AGENT_BIN_FOR(account)) / ".gemini/antigravity-cli/log"
        year = time.localtime(now).tm_year
        for f in logdir.glob("cli-*.log"):
            if f.stat().st_mtime < now - within:
                continue
            for line in f.read_text(errors="ignore")[-300000:].splitlines():
                m = LOG_BUSY.search(line) and LOG_LINE_AT.match(line)
                if m and now - time.mktime((year, int(m[1]), int(m[2]), int(m[3]), int(m[4]), int(m[5]), 0, 0, -1)) <= within:
                    return True
    except Exception:   # noqa: BLE001  모르면 정상으로 본다(전환 순서만 정하는 용도)
        return False
    return False


def healthy_first(pool):
    """오류 없는 계정 먼저(그 안에서는 원래 순서 = 남은 사용량 많은 순)."""
    if not AGENT_BIN_FOR:
        return list(pool)
    return sorted(pool, key=lambda b: recently_busy(b))


def failover_accounts(pool, first):
    """전환할 계정 차례. 주문팀은 끝까지 처리: 풀을 다 돌아도 혼잡이면 처음 계정까지 넣어 다시(1시간까지)."""
    yield from healthy_first(pool)
    if not CONV_KEY:
        return
    everyone = list(dict.fromkeys([str(first)] + [str(b) for b in pool]))
    deadline = time.monotonic() + ORDER_RETRY_FOR
    while time.monotonic() < deadline and "agent_server_busy" in CAUSES.values():
        time.sleep(10)
        yield from healthy_first(everyone)


BACKUP_ACCOUNT = None   # ss_runtime이 [backup] 계정을 넣는다(없으면 재시도하지 않음)
CAUSES = {}   # 이번 실행에서 계정별로 막힌 원인(agent_quota=사용량 한도 소진, agent_server_busy=Gemini 서버 혼잡)
BACKUP_ACCOUNTS = []    # 백업 풀(남은 사용량 많은 순) — 2026-10-09, 한도면 차례로 시도
SWITCH_ACCOUNT = None   # ss_runtime이 넣는 함수: 계정을 바꿀 때 실행 파일·브라우저 연결을 맞춘다
EMERGENCY_GPT = None    # ss_runtime이 넣는 함수(2026-10-22): 풀의 Gemini가 모두 소진이면 비상용 GPT가 남은 계정 목록
EMERGENCY_MODEL = "gpt-oss-120b-medium"
LIVE_MARK = LIVE_CLEAR = None   # ss_runtime이 넣는 함수(ss_live): 업무 웹 실시간 구성도용 실행 중 표시
# Gemini 서버 혼잡 중 강등(2026-10-21 사용자 지시 '503시 flash-medium 전환, 회복시 다시 high'): 같은 Flash의 추론 단계만 낮춘다
# (Claude·GPT로 바꾸지 않음). 혼잡 여부는 ss_gemini_busy_watch가 쓰는 gemini-busy.json의 alerted — 회복 알림과 함께 풀리면 다음 실행부터 high.
BUSY_MODEL = {"gemini-3.8-flash-high": "gemini-3.8-flash-medium"}
COPILOT_ESCALATE = None   # ss_runtime이 넣는 Copilot 모델(copilot:…, 2026-11-13): Gemini·GPT가 모두 안 될 때 마지막 단계
COPILOT_TOOLSETS = None   # 그때 쓸 Hermes 도구 묶음(이행 담당은 터미널 포함)
BUSY_GPT = None   # ss_runtime이 넣는 함수(2026-11-13): 혼잡으로 계정 전환·medium이 다 실패할 때 GPT가 남은 계정 목록(flash-low는 쓰지 않음)
BUSY_STATE = Path.home() / ".local/state/smartstore/gemini-busy.json"


def busy_model(model):
    """혼잡 중이면 high → medium, 아니면 그대로."""
    if model not in BUSY_MODEL:
        return model
    try:
        return BUSY_MODEL[model] if json.loads(BUSY_STATE.read_text()).get("alerted") else model
    except (OSError, ValueError, AttributeError):
        return model


BUSY_RUNS = Path.home() / ".local/state/smartstore/busy-model-runs.jsonl"


def note_busy_run(item, ok, reason=""):
    """혼잡 중 낮춘 모델(medium)로 실행한 작업의 성공·실패 — 회복 알림에 함께 싣는다(2026-10-21 사용자 지시). 실패해도 업무는 계속."""
    if (MODEL not in BUSY_MODEL.values() and MODEL != EMERGENCY_MODEL) or not WORKSPACE.name.startswith("workspace-"):   # 회귀 시험(임시 폴더)은 운영 기록에 남기지 않는다
        return
    try:
        with BUSY_RUNS.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"at": time.time(), "employee": WORKSPACE.name.replace("workspace-", ""), "request_id": item.get("request_id", ""),
                                "account": ACCOUNT, "model": MODEL, "ok": ok, "reason": reason}, ensure_ascii=False) + "\n")
    except OSError:
        pass


HERMES_BIN = os.path.join(pwd.getpwuid(os.getuid()).pw_dir, ".local/bin/hermes")
COPILOT_FALLBACK = None   # ss_runtime이 넣는 agy 모델: Copilot 사용량 한도면 이 모델로 실행(2026-10-19)
# 2026-11-02 사용자 지시: "Copilot GPT가 실패하면 Gemini 계정(agy)의 Claude를 예외적으로 사용" — 지휘본부(copilot:) 실행에만.
# 다른 사원·다른 경우의 Claude 금지는 그대로다(Gemini 소진 비상은 GPT, 2026-10-22). Claude도 한도면 COPILOT_FALLBACK(Gemini)으로.
HQ_CLAUDE_FALLBACK = "claude-opus-4-6-thinking"
COPILOT_QUOTA = Path(pwd.getpwuid(os.getuid()).pw_dir) / ".cache/smartstore/copilot-quota.json"
COPILOT_LOG_QUOTA = re.compile(r"RateLimitError|quota exceeded", re.I)


def copilot_exhausted():
    """GitHub Copilot 프리미엄 요청(월) 남은 비율이 0인지 — copilot_internal/user, 10분 캐시. 모르면 False(Copilot으로 실행).
    2026-10-19: 0%가 된 뒤 Hermes가 429를 10분 간격으로 재시도하다 지휘본부 정기 보고·CFO 질의가 모두 15분 시간 초과."""
    try:
        c = json.loads(COPILOT_QUOTA.read_text())
        if time.time() - c["at"] < 600 and (not c.get("exhausted") or time.time() < c.get("reset_epoch", 0)):
            return bool(c.get("exhausted"))
    except (OSError, ValueError, KeyError):
        pass
    try:
        import urllib.request
        tok = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=20).stdout.strip()
        req = urllib.request.Request("https://api.github.com/copilot_internal/user", headers={"Authorization": f"token {tok}"})
        d = json.loads(urllib.request.urlopen(req, timeout=10).read())
        prem = (d.get("quota_snapshots") or {}).get("premium_interactions") or {}
        exhausted = not prem.get("unlimited") and float(prem.get("percent_remaining", 100)) <= 0
        reset = d.get("quota_reset_date_utc") or ""
    except Exception:  # noqa: BLE001
        return False
    mark_copilot(exhausted, reset)
    return exhausted


def mark_copilot(exhausted, reset=""):
    """소진 표시(초기화 시각까지, 모르면 1시간) — 다음 실행부터 바로 대체 모델."""
    try:
        import datetime as _dt
        epoch = _dt.datetime.fromisoformat(reset.replace("Z", "+00:00")).timestamp() if reset else time.time() + 3600
        COPILOT_QUOTA.parent.mkdir(parents=True, exist_ok=True)
        COPILOT_QUOTA.write_text(json.dumps({"at": time.time(), "exhausted": exhausted, "reset": reset, "reset_epoch": epoch}))
    except (OSError, ValueError):
        pass
HERMES_LOGS = Path(pwd.getpwuid(os.getuid()).pw_dir) / ".hermes/profiles"
HERMES_SESSION = re.compile(r"^\d{8}_\d{6}_[0-9a-f]{6}$")


TOOLSETS = None   # ss_runtime이 승인 실행에서만 넣는 Hermes 도구 묶음(-t)
HQ_WRITE_ROOTS = None   # ss_runtime이 지휘본부에 넣는 허용 쓰기 폴더 목록(2026-10-10 사용자: 지시·조치 파일만 예외)
_HQ_ALERTED = {}
WRITE_TOOLS = {"write_file", "patch", "edit_file", "file_write", "str_replace", "create_file", "apply_patch"}


def check_hq_write(item, event):
    """지휘본부의 파일 쓰기 경로가 허용 폴더 밖이면 바로 운영 알림(Hermes에는 경로 제한 설정이 없어 사후 감시로 보완)."""
    if not HQ_WRITE_ROOTS or (USER_DIRECTED and USER_DIRECTED(item)):   # 사용자 직접 지시 실행은 지시한 범위의 쓰기가 허용됨(Z339)
        return
    try:
        blob = event.get("tool") if isinstance(event.get("tool"), dict) else event
        name = str(blob.get("name") or blob.get("tool_name") or event.get("name") or "")
        if name not in WRITE_TOOLS:
            return
        args = blob.get("input") or blob.get("arguments") or blob.get("args") or {}
        if isinstance(args, str):
            args = json.loads(args) if args.strip().startswith("{") else {}
        path = str(args.get("path") or args.get("file_path") or args.get("target") or "")
        real = os.path.realpath(os.path.expanduser(path)) if path else ""
        seen = _HQ_ALERTED.setdefault(item.get("request_id", ""), set())   # 같은 실행·같은 경로는 한 번만(2026-10-10 17:01·17:02 두 번 감)
        if real and real not in seen and not any(real == r or real.startswith(r.rstrip("/") + "/") for r in HQ_WRITE_ROOTS):
            seen.add(real)
            shown = real.replace(str(Path(__import__("pwd").getpwuid(os.getuid()).pw_dir)) + "/", "")   # Slack 정리기가 /home/… 경로를 가리므로 홈 기준으로
            alert("hq_write_outside", "urgent", f"지휘본부 사원이 허용 밖 파일에 쓰기를 시도했습니다: {shown} (도구 {name}). 허용: 지시·조치 파일만. "
                  "사용자 할 일: 바뀐 내용을 보시고 유지·되돌림을 정해 주세요 — 지휘본부(상급자)의 조치라 Mason은 되돌리지 않고 무엇이 바뀌었는지만 확인해 보고합니다.",
                  request_id=item.get("request_id", ""))
    except Exception:  # noqa: BLE001  감시 실패가 업무를 막지 않게
        pass


def copilot_run(item, db, conversation_id):
    """모델 이름이 'copilot:<모델>'인 사원(2026-10-06: 지휘본부를 GitHub Copilot GPT로) — agy 대신 Hermes 엔진의 Copilot 제공자로 실행.
    사원 Hermes 프로필(규칙·스킬)과 작업 폴더(AGENTS.md·SOUL.md·TOOLS.md)를 그대로 쓴다. GitHub 토큰은 실행할 때 `gh auth token`으로 받아
    환경 변수(COPILOT_GITHUB_TOKEN)로만 넘긴다(파일·로그에 남기지 않음, Hermes에 9/4 저장된 옛 토큰은 401)."""
    employee = WORKSPACE.name.replace("workspace-", "", 1)
    model = MODEL.split(":", 1)[1]
    prompt = build_prompt(item)
    if OUTPUT_SCHEMA is not None:
        prompt += "\n\n답은 다음 JSON 스키마에 맞는 JSON 하나만 출력하라(설명 없이): " + json.dumps(OUTPUT_SCHEMA, ensure_ascii=False)
    prompt = spill_prompt(prompt, item)
    # 2026-11-01 Z389: Hermes(10-28 업데이트)가 게이트웨이로 실행하며 --run-budget을 거부(exit 2) — 시간 제한은 아래 감시 루프(TIMEOUT)가 한다.
    # Copilot 제공자는 github-copilot 플러그인으로 옮겨졌고, 게이트웨이는 실행 환경 변수의 토큰을 받지 않아 프로필 인증(auth add copilot)에 둔다.
    command = [HERMES_BIN, "-p", employee, "chat", "-q", prompt, "--oneshot", "--quiet", "--provider", "copilot", "-m", model,
               "--format", "stream-json", "--yolo"]
    if TOOLSETS:   # 2026-10-14 Z211: 사용자 승인 실행에서만 도구 묶음을 넓힌다(CTO 명령 실행)
        command.extend(["-t", TOOLSETS])
    if conversation_id and HERMES_SESSION.match(conversation_id):   # agy 대화 번호는 Hermes에서 이어 쓸 수 없다
        command.extend(["--resume", conversation_id])
    env = dict(os.environ)
    tools = os.path.join(pwd.getpwuid(os.getuid()).pw_dir, ".local/bin")
    if tools not in env.get("PATH", "").split(":"):
        env["PATH"] = tools + ":" + env.get("PATH", "/usr/local/bin:/usr/bin:/bin")
    try:
        env["COPILOT_GITHUB_TOKEN"] = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:  # noqa: BLE001
        pass
    started = time.monotonic()
    hermes_log = HERMES_LOGS / employee / "logs/agent.log"
    try:
        log_pos = hermes_log.stat().st_size
    except OSError:
        log_pos = None
    proc = subprocess.Popen(command, cwd=WORKSPACE, stdin=subprocess.DEVNULL, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    emit("progress", stage="started", text="요청을 처리하고 있습니다.")
    result, last_notice, stage_text = None, started, "요청을 읽고 답변을 준비하고 있습니다."
    buffers = {"stdout": b"", "stderr": b""}
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ, "stdout")
    selector.register(proc.stderr, selectors.EVENT_READ, "stderr")

    def consume(line):
        nonlocal result, conversation_id, stage_text, last_notice
        try:
            event = json.loads(line)
        except (ValueError, UnicodeDecodeError):
            return
        kind = event.get("type")
        if kind == "system" and event.get("session_id"):
            conversation_id = event["session_id"]
            save_conversation(db, conversation_id)
            db.execute("UPDATE runs SET conversation_id=? WHERE request_id=?", (conversation_id, item["request_id"]))
            db.commit()
            emit("session", conversation_id=conversation_id)
        elif kind in ("tool_use", "tool_call", "tool"):
            check_hq_write(item, event)
            stage_text = "도구를 사용하고 있습니다."
            if time.monotonic() - last_notice >= 5:
                emit("progress", stage="tool", text=stage_text, elapsed=int(time.monotonic() - started))
                last_notice = time.monotonic()
        elif kind == "text":
            stage_text = "답변을 작성하고 있습니다."
        elif kind == "result":
            result = event
            note_usage(item, event.get("result") if isinstance(event.get("result"), dict) else event)   # 지휘본부(Copilot)도 실행 기록(토큰은 알려 줄 때만)

    try:
        last_act = time.monotonic()
        while selector.get_map():
            now = time.monotonic()
            if past_limit(now, started, last_act):
                raise TimeoutError("agent_timeout")
            if log_pos is not None and result is None:   # Hermes는 429를 10분 간격으로 재시도한다 — 기다리지 않고 대체 모델로
                try:
                    with hermes_log.open("rb") as fh:
                        fh.seek(log_pos)
                        tail = fh.read()
                    log_pos += len(tail)
                    tail = tail.decode("utf-8", "ignore")
                    if COPILOT_LOG_QUOTA.search(tail) and "provider=copilot" in tail:
                        mark_copilot(True)
                        raise RuntimeError("agent_quota")
                except OSError:
                    pass
            if now - last_notice >= HEARTBEAT:
                emit("progress", stage="working", text=stage_text, elapsed=int(now - started))
                last_notice = now
            for key, _mask in selector.select(timeout=1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    if key.data == "stdout" and buffers["stdout"].strip():
                        consume(buffers["stdout"])
                    continue
                buffers[key.data] += chunk
                last_act = time.monotonic()
                if key.data == "stderr":
                    buffers["stderr"] = buffers["stderr"][-16000:]
                    continue
                while b"\n" in buffers["stdout"]:
                    line, buffers["stdout"] = buffers["stdout"].split(b"\n", 1)
                    consume(line)
        code = proc.wait(timeout=5)
        text = ((result or {}).get("text") or "").strip()
        if code or not result or result.get("exit_code"):
            if QUOTA_PATTERN.search(text):
                raise RuntimeError("agent_quota")
            with open(STATE_DIR / "failures.log", "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "request_id": item.get("request_id"), "backend": "copilot",
                                     "model": model, "exit_code": code, "result_exit": (result or {}).get("exit_code"),
                                     "auth_error": bool(re.search(r"\b401\b|rejected your API key", text))}, ensure_ascii=False) + "\n")
            raise RuntimeError("agent_failed" if result else "agent_result_missing")
        if not text:
            raise RuntimeError("agent_empty_response")
        return text, conversation_id, round(time.monotonic() - started, 3)
    finally:
        stop_process(proc)
        selector.close()
        proc.stdout.close()
        proc.stderr.close()


USAGE_LOG = Path(__import__("pwd").getpwuid(os.getuid()).pw_dir) / ".local/state/smartstore/agy-run-usage.jsonl"


def note_usage(item, result):
    """실행마다 agy가 알려 주는 토큰 사용량을 남긴다(2026-10-09: 코드 전환 전후 토큰 절약을 숫자로 보고하려고). 실패해도 업무는 계속."""
    try:
        u = result.get("usage") or {}
        rec = {"at": time.time(), "employee": WORKSPACE.name.replace("workspace-", ""), "request_id": item.get("request_id", ""),
               "account": ACCOUNT, "model": MODEL, "status": result.get("status"), "duration_s": result.get("duration_seconds"),
               "turns": result.get("num_turns"), **{k: u.get(k) for k in ("input_tokens", "output_tokens", "thinking_tokens", "cache_read_tokens", "total_tokens")}}
        USAGE_LOG.parent.mkdir(parents=True, exist_ok=True)
        with USAGE_LOG.open("a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:  # noqa: BLE001
        pass


def native_run(item, db, conversation_id):
    """실행 중 표시(업무 웹 실시간 구성도, 2026-10-22): 이 실행의 계정·모델을 LIVE_MARK로 남기고 끝나면 지운다(백업 전환 때마다 다시)."""
    mark = LIVE_MARK(ACCOUNT if not MODEL.startswith("copilot:") else "copilot", MODEL, item.get("request_id")) if LIVE_MARK else None
    try:
        return _native_run(item, db, conversation_id)
    finally:
        if LIVE_CLEAR:
            LIVE_CLEAR(mark)


def _native_run(item, db, conversation_id):
    if MODEL.startswith("copilot:"):
        return copilot_run(item, db, conversation_id)
    command = [
        AGENT_BIN, "--model", MODEL, "--sandbox", *([] if SLASH_COMMANDS else ["--disable-slash-commands"]), "--mode",
        "accept-edits" if USER_DIRECTED and USER_DIRECTED(item) and AGENT_MODE == "plan" else AGENT_MODE,
        "--output-format", "stream-json", "--print-timeout", "0s",   # 11-05: 제한은 past_limit(50분 + 15분 무진행)이 — 진행 중이면 계속
    ]
    if OUTPUT_SCHEMA is not None:
        command.extend(["--json-schema", json.dumps(OUTPUT_SCHEMA)])
    if conversation_id:
        command.extend(["--conversation", conversation_id])
    command.extend(["-p", spill_prompt(build_prompt(item), item)])
    started = time.monotonic()
    wall_started = time.time() - 1   # 계정 로그(파일 수정 시각)와 비교용
    # 업무 도구(ss-acct·ss-order·ss-naver-api 등)는 실제 홈의 ~/.local/bin에 있다. 서비스 PATH에는 없어서 사원이 찾느라 헤맸다(2026-09-28)
    env = dict(os.environ)
    tools = os.path.join(pwd.getpwuid(os.getuid()).pw_dir, ".local/bin")
    if tools not in env.get("PATH", "").split(":"):
        env["PATH"] = tools + ":" + env.get("PATH", "/usr/local/bin:/usr/bin:/bin")
    proc = subprocess.Popen(
        command, cwd=WORKSPACE, stdin=subprocess.DEVNULL, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
    )
    emit("progress", stage="started", text="요청을 처리하고 있습니다.")
    result = None
    last_notice = started
    stage_text = "요청을 읽고 답변을 준비하고 있습니다."
    buffers = {"stdout": b"", "stderr": b""}
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ, "stdout")
    selector.register(proc.stderr, selectors.EVENT_READ, "stderr")
    prior_handlers = {}

    def interrupted(signum, _frame):
        raise InterruptedError("agent_interrupted")

    for signum in (signal.SIGTERM, signal.SIGINT):
        prior_handlers[signum] = signal.signal(signum, interrupted)

    # 2026-10-09: 결과가 ERROR여도 최종 답변 단계가 끝까지 나왔으면 살린다(Ava 12:40·Noah 09~11시: 일·보고는 다 했는데 결과만 ERROR)
    replies, last_step = {}, {"type": "", "done_text": ""}

    def consume(line):
        nonlocal result, conversation_id, stage_text, last_notice
        try:
            event = json.loads(line)
        except (ValueError, UnicodeDecodeError):
            return
        kind = event.get("event")
        if kind == "init":
            conversation_id = event.get("conversation_id")
            if conversation_id:
                save_conversation(db, conversation_id)
                db.execute("UPDATE runs SET conversation_id=? WHERE request_id=?", (conversation_id, item["request_id"]))
                db.commit()
                emit("session", conversation_id=conversation_id)
        elif kind == "step_update":
            step = event.get("step_update", {})
            step_type = step.get("step_type", "")
            if step_type and step_type != "user_input":
                last_step["type"] = step_type
            if step_type == "agent_response":
                idx = str(step.get("step_index", ""))
                replies[idx] = replies.get(idx, "") + str(step.get("text_delta") or "")
                if step.get("state") == "DONE":
                    last_step["done_text"] = replies[idx]
            # Only expose known tool categories, never arguments or reasoning.
            if step_type in TOOL_LABELS:
                stage_text = TOOL_LABELS[step_type]
            elif step_type == "agent_response":
                stage_text = "답변을 작성하고 있습니다."
            if time.monotonic() - last_notice >= 5 and step_type in TOOL_LABELS:
                emit("progress", stage=step_type, text=stage_text, elapsed=int(time.monotonic() - started))
                last_notice = time.monotonic()
        elif kind == "result":
            result = event.get("result", {})
            note_usage(item, result)

    try:
        last_busy_check, busy_logs = started, set()
        result_seen, lingered = None, False
        last_out = time.monotonic()   # 주문팀 '느림' 판정: 마지막 모델 출력(스트림 줄) 시각
        last_tool = last_tool_check = last_out   # 50분 넘긴 뒤 '진행 중' 판정: 도구 실행 중도 진행으로 본다
        while selector.get_map():
            now = time.monotonic()
            # 결과는 받았는데 agy가 끝나지 않아 출력이 안 닫힘(2026-10-21 Ethan 시험: 13:18 답 완료 → 13:25 시간 초과로 답이 버려짐)
            if result is not None:
                result_seen = result_seen or now
                if now - result_seen > RESULT_GRACE:
                    lingered = True
                    break
            if past_limit(now, started, max(last_out, last_tool)):
                raise TimeoutError("agent_timeout")
            if now - last_tool_check >= 30:   # 도구가 도는 동안은 출력이 없어도 진행 중
                last_tool_check = now
                if tool_running(proc.pid):
                    last_tool = now
            # Gemini 서버 혼잡: agy가 8번(약 3분) 재시도하고 끝나기 전에, 3번째 재시도도 실패하면 바로 다른 계정으로(2026-10-20)
            fast = bool(CONV_KEY) or fast_team()
            if MODEL.startswith("gemini") and now - last_busy_check >= (ORDER_BUSY_CHECK if fast else 30):
                last_busy_check = now
                busy_logs |= own_agent_logs(proc.pid)
                if account_log_busy(busy_logs, LOG_BUSY_ORDER if fast else None):
                    mark_slow(ACCOUNT)   # 11-06: 혼잡 계정은 30분 동안 모든 사원의 시작·전환 순서 맨 뒤(Ava가 88에서 시작→혼잡→재시작을 11-05 12시~ 24번)
                    raise RuntimeError("agent_server_busy")
                if fast and result is None and now - last_out > ORDER_SLOW_SEC and not tool_running(proc.pid):
                    mark_slow(ACCOUNT)
                    alert("busy_failover", "warn", f"주문 처리 중 agy-{ACCOUNT} 계정 Gemini 응답이 {int(now - last_out)}초 동안 없어(도구 실행 아님, 평소 5~10초) "
                          "느린 계정으로 보고 바로 다른 계정으로 넘깁니다. 사용자 할 일: 없습니다.", account=ACCOUNT, request_id=item["request_id"])
                    raise RuntimeError("agent_server_busy")
            if now - last_notice >= HEARTBEAT:
                emit("progress", stage="working", text=stage_text, elapsed=int(now - started))
                last_notice = now
            for key, _mask in selector.select(timeout=1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    if key.data == "stdout" and buffers["stdout"].strip():
                        consume(buffers["stdout"])
                    continue
                buffers[key.data] += chunk
                if key.data == "stdout":
                    last_out = time.monotonic()
                if key.data == "stderr":
                    buffers["stderr"] = buffers["stderr"][-16000:]
                    continue
                while b"\n" in buffers["stdout"]:
                    line, buffers["stdout"] = buffers["stdout"].split(b"\n", 1)
                    consume(line)
        if lingered:   # 결과는 이미 받았으니 남은 프로세스를 끝내고 결과대로 처리
            stop_process(proc)
            code = 0
            with open(STATE_DIR / "failures.log", "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "request_id": item.get("request_id"), "account": ACCOUNT,
                                     "result_status": result.get("status"), "lingered": True}, ensure_ascii=False) + "\n")
        else:
            code = proc.wait(timeout=5)
        if (code or not result or result.get("status") != "SUCCESS" or not (result.get("response") or "").strip()) \
                and account_log_quota(wall_started):
            raise RuntimeError("agent_quota")
        # GPT(비상)도 503 No capacity면 혼잡으로 본다 — 11-13 18:29 …6101: agy-77 GPT 503이 일반 실패로 분류돼 다음 GPT 계정(99)·자동 재시도 없이 끝남
        if (code or not result or result.get("status") != "SUCCESS") and (not MODEL.startswith("claude") or MODEL == EMERGENCY_MODEL) and LOG_BUSY.search(
                str((result or {}).get("error") or "") + buffers["stderr"].decode("utf-8", "ignore")[-4000:]):
            raise RuntimeError("agent_server_busy")
        if (code or not result or result.get("status") != "SUCCESS") and QUOTA_PATTERN.search(
                buffers["stderr"].decode("utf-8", "ignore") + json.dumps(result or {}, ensure_ascii=False)):
            raise RuntimeError("agent_quota")
        salvage = last_step["done_text"].strip() if last_step["type"] == "agent_response" else ""
        if result and result.get("status") != "SUCCESS" and len(salvage) >= 80 and not code:
            with open(STATE_DIR / "failures.log", "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "request_id": item.get("request_id"), "account": ACCOUNT,
                                     "result_status": result.get("status"), "error": str(result.get("error") or "")[:300],
                                     "salvaged": True}, ensure_ascii=False) + "\n")
            return salvage, conversation_id, round(time.monotonic() - started, 3)
        if code or not result or result.get("status") != "SUCCESS":
            # 원인 추적용: 종료 코드·결과 상태·키 이름·agy 오류 문구(앞 300자)만 남긴다(본문·stderr 원문은 남기지 않음).
            with open(STATE_DIR / "failures.log", "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "request_id": item.get("request_id"),
                                     "account": ACCOUNT, "exit_code": code, "result_status": (result or {}).get("status"),
                                     "result_keys": sorted((result or {}).keys()),
                                     "stderr_tail_kind": QUOTA_PATTERN.search(buffers["stderr"].decode("utf-8", "ignore")) is not None,
                                     "error": str((result or {}).get("error") or "")[:300], "last_step": last_step["type"]},
                                    ensure_ascii=False) + "\n")
            # Never relay raw stderr/command exceptions, which may contain prompts.
            raise RuntimeError("agent_failed" if result else "agent_result_missing")
        answer = result.get("response", "").strip()
        if not answer:
            raise RuntimeError("agent_empty_response")
        return answer, conversation_id, round(time.monotonic() - started, 3)
    finally:
        stop_process(proc)
        selector.close()
        proc.stdout.close()
        proc.stderr.close()
        for signum, handler in prior_handlers.items():
            signal.signal(signum, handler)


def run(item):
    db = connect_store()
    lock_file = open(STATE_DIR / "conversation.lock", "a")
    wait_started = time.monotonic()
    last_notice = -HEARTBEAT
    try:
        while True:
            try:
                fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                waited = time.monotonic() - wait_started
                if waited > TIMEOUT:
                    raise TimeoutError("conversation_busy")
                if waited - last_notice >= HEARTBEAT:
                    emit("progress", stage="queued", text="먼저 받은 요청을 처리 중이며, 이 요청은 순서대로 이어서 처리합니다.", elapsed=int(waited))
                    last_notice = waited
                time.sleep(0.5)
        prior = db.execute("SELECT * FROM runs WHERE request_id=?", (item["request_id"],)).fetchone()
        if prior:
            if prior["status"] == "completed":
                emit("result", status="completed", answer=prior["answer"], conversation_id=prior["conversation_id"], cached=True)
                return 0
            raise RuntimeError(prior["error"] or "interrupted_execution")
        now = time.time()
        db.execute("INSERT INTO runs(request_id,source,user_text,status,started_at,updated_at) VALUES (?,?,?,'running',?,?)",
                   (item["request_id"], item.get("source", "slack"), item.get("original_text", item["text"]), now, now))
        db.commit()
        # 정기 업무는 지시문·스킬만으로 완결 — 긴 대화를 이어 쓰지 않는다(대화가 쌓이면 끝 답변이 실패, 2026-10-09)
        global KEEP_CONVERSATION, MODEL, TOOLSETS
        # 2026-10-14: CTO 자동 작업(접수·승인 실행·시험·의뢰)도 매번 새 대화 — Copilot 대화는 크기 검사가 없어 10-06부터 한 대화에 쌓여
        # CHG-010 시간 초과 뒤 모든 실행이 즉시 실패(agent_failed). 이 작업들은 지시문·스킬·제안서 파일만으로 완결된다.
        # 2026-11-03 Z414: Ava 확대 검색·보정 재시도·스킬 회귀 시험도 지시문(후보표·근거 경로·이전 판정)만으로 완결된다 — 빠져 있어
        # 3일간 37회가 대화 7개에 이어 붙어 순번마다 커짐(1~2번째 40만 → 5번째 이상 100만 토큰, Ava 사용량의 약 23%).
        # 앞 작업 맥락에 끌려 검증 코드·git 기록을 뒤지는 일도 같이 생겼다.
        ephemeral = str(item.get("request_id", "")).startswith(EPHEMERAL_PREFIXES)
        KEEP_CONVERSATION = not ephemeral
        if SWITCH_ACCOUNT and MODEL.startswith("gemini") and recently_busy(ACCOUNT):
            # 배정 계정에 최근 503·응답 정지(30분 '느림' 표시 포함)가 있으면 처음부터 오류 없는 계정으로(2026-11-04 사용자 "오류 없는 계정으로 자동으로").
            # 2026-11-06: 주문팀만 → 모든 Gemini 사원. Ava가 매 실행 혼잡한 88에서 시작해 몇 분 뒤 처음부터 다시(11-05 12시~ 24번, 작업함 2~3시간 밀림).
            ok = [b for b in healthy_first(BACKUP_ACCOUNTS or []) if str(b) != str(ACCOUNT) and not recently_busy(b)]
            if ok:
                emit("progress", stage="busy", text=f"agy-{ACCOUNT} 계정에 최근 Gemini 서버 혼잡이 있어 agy-{ok[0]} 계정으로 시작합니다.")
                BACKUP_ACCOUNTS[:] = [str(ACCOUNT)] + [b for b in BACKUP_ACCOUNTS if str(b) != str(ok[0])]
                SWITCH_ACCOUNT(ok[0])
        current = None if ephemeral else resume_or_recap(db, item)
        failure = None
        try:
            answer, conversation_id, duration = native_run(item, db, current)
        except RuntimeError as error:
            failure = error
        if failure is not None and MODEL.startswith("copilot:") and HQ_CLAUDE_FALLBACK:
            # 지휘본부 Copilot 실패(한도·오류·시간 초과 모두): 같은 요청을 agy 계정의 Claude로 한 번 더(2026-11-02 사용자 예외 허용)
            emit("progress", stage="failover", text="Copilot 실행이 실패해 agy Claude로 다시 시도합니다.")
            alert("hq_failover", "warn", f"지휘본부 Copilot({MODEL.split(':', 1)[1]}) 실행 실패({failure}) → agy {HQ_CLAUDE_FALLBACK}로 대신 실행"
                  f"(사용자 예외 허용 — Copilot이 실패할 때만)", request_id=item["request_id"])
            MODEL = HQ_CLAUDE_FALLBACK
            item.pop("recent_turns", None)
            current = None if ephemeral else resume_or_recap(db, item)
            try:
                answer, conversation_id, duration = native_run(item, db, current)
                failure = None
            except RuntimeError as again:
                failure = again
        if failure is not None and str(failure) == "agent_quota" and (MODEL.startswith("copilot:") or MODEL == HQ_CLAUDE_FALLBACK) and COPILOT_FALLBACK:
            # 지휘본부 Copilot·대체 Claude도 한도: 같은 요청을 agy 기본 모델로 한 번 더(그 뒤 한도면 아래 백업 계정 풀)
            emit("progress", stage="quota", text="Copilot·Claude 사용량 한도에 걸려 Gemini로 다시 시도합니다.")
            alert("quota_failover", "warn", f"지휘본부 {MODEL.split(':', 1)[-1]} 사용량 한도 → {COPILOT_FALLBACK}로 실행",
                  request_id=item["request_id"])
            MODEL = COPILOT_FALLBACK
            item.pop("recent_turns", None)
            current = None if ephemeral else resume_or_recap(db, item)
            try:
                answer, conversation_id, duration = native_run(item, db, current)
                failure = None
            except RuntimeError as again:
                failure = again
        if failure is not None:
            error = failure
            pool = list(BACKUP_ACCOUNTS or ([BACKUP_ACCOUNT] if BACKUP_ACCOUNT else []))
            pool = [b for b in pool if str(b) != str(ACCOUNT)]   # 이미 이 계정으로 돌고 있으면 다음 백업부터
            if str(error) not in ("agent_quota", "agent_server_busy") or not SWITCH_ACCOUNT:
                raise error
            # 계정 사용량 한도·서버 혼잡(2026-10-20 88번 503): 백업 풀을 남은 사용량 많은 순으로 차례로(2026-10-09 '백업 계정 병행').
            # 대화 ID는 계정별이라 최근 기록 요약으로 이어받는다.
            # 한도(계정 주간 사용량 소진)와 서버 혼잡(Gemini 서버 503·응답 정지, 한도는 남음)은 알림 종류·문구를 나눈다(2026-10-20 사용자 지시).
            last = error
            CAUSES[str(ACCOUNT)] = str(error)
            first_account = ACCOUNT
            # 2026-11-13 사용자 지시 "계정 번갈아 바꿔도 안되면 모델을 낮추고 그래도 안되면 gpt로"(flash-low는 빼고): 혼잡이면 flash-medium으로
            # 계정 한 바퀴 → 그래도 혼잡이면 아래 비상 GPT(주문 …6101: 계정만 75분 돌다 이행 작업이 끝남)
            busy_n, n_acc, done = 0, len({str(first_account), *(str(b) for b in pool)}), False
            for backup in failover_accounts(pool, first_account):
                if str(last) == "agent_quota":
                    emit("progress", stage="quota", text="모델 계정 사용량 한도가 소진돼 백업 계정으로 다시 시도합니다.")
                    alert("quota_failover", "warn", f"모델 계정 agy-{ACCOUNT} 사용량 한도 소진 → 백업 agy-{backup}로 전환",
                          account=ACCOUNT, backup=backup, request_id=item["request_id"])
                else:
                    busy_n += 1
                    if busy_n > n_acc or not MODEL.startswith("gemini"):
                        break   # medium으로 계정을 한 바퀴 돌아도 혼잡 → 비상 GPT
                    MODEL = BUSY_MODEL.get(MODEL, MODEL)   # 혼잡이면 같은 Flash의 medium으로 낮춰 다시(2026-10-21)
                    emit("progress", stage="busy", text=f"Gemini 서버 혼잡으로 다른 계정·{MODEL}로 다시 시도합니다(사용량 한도는 남아 있음).")
                    alert("busy_failover", "warn", f"Gemini 서버 혼잡(503·응답 정지) — agy-{ACCOUNT} 계정 사용량 한도와는 무관 → agy-{backup} 계정·{MODEL}로 다시 실행",
                          account=ACCOUNT, backup=backup, model=MODEL, request_id=item["request_id"])
                SWITCH_ACCOUNT(backup)
                item.pop("recent_turns", None)
                current = None if ephemeral else resume_or_recap(db, item)
                if CONV_KEY and not str(item.get("text", "")).startswith(ORDER_RESUME_NOTE):
                    item["text"] = ORDER_RESUME_NOTE + str(item.get("text", ""))
                try:
                    answer, conversation_id, duration = native_run(item, db, current)
                    done = True
                    break
                except RuntimeError as again:
                    if str(again) not in ("agent_quota", "agent_server_busy"):
                        raise
                    last = again
                    CAUSES[str(ACCOUNT)] = str(again)
            if not done:
                # 2026-10-22 사용자 지시: 모든 계정의 Gemini가 사용량 한도 소진이면 비상용으로 각 계정의 GPT(Claude는 쓰지 않음)
                # 2026-11-13 사용자 지시: 혼잡으로 flash-medium까지 계정을 돌아도 안 되면 GPT로(GPT 사용량이 남은 계정)
                all_quota = set(CAUSES.values()) == {"agent_quota"}
                busy = "agent_server_busy" in CAUSES.values()
                gpt = (EMERGENCY_GPT(list(CAUSES)) if EMERGENCY_GPT and all_quota else
                       BUSY_GPT() if BUSY_GPT and busy else [])
                why = "모든 계정 Gemini 사용량 한도 소진" if all_quota else "Gemini 서버 혼잡 — 계정 전환·flash-medium 모두 실패"
                for acct in gpt:
                    MODEL = EMERGENCY_MODEL
                    emit("progress", stage="quota" if all_quota else "busy", text=f"{why} — 비상 모델({MODEL})로 다시 시도합니다.")
                    alert("gpt_emergency", "warn", f"{why} → 비상용 agy-{acct} 계정 {MODEL}로 실행",
                          account=acct, model=MODEL, request_id=item["request_id"])
                    SWITCH_ACCOUNT(acct)
                    item.pop("recent_turns", None)
                    current = None if ephemeral else resume_or_recap(db, item)
                    try:
                        answer, conversation_id, duration = native_run(item, db, current)
                        break
                    except RuntimeError as again:
                        if str(again) not in ("agent_quota", "agent_server_busy"):
                            raise
                        last = again
                else:
                    # 2026-11-13 사용자 지시 "gpt도 실패하면 코파일럿까지": Gemini·GPT가 모두 안 되면 Hermes Copilot(프로필에 Copilot 인증이 있는 사원만).
                    # 이행 담당은 터미널 도구(ss-fulfill·ss-browse)와 모델별 보충 스킬(model-skills/copilot.md)로 돈다(ss_runtime).
                    if not (COPILOT_ESCALATE and not copilot_exhausted()):
                        raise last
                    MODEL, TOOLSETS = COPILOT_ESCALATE, COPILOT_TOOLSETS or TOOLSETS
                    emit("progress", stage="busy", text=f"Gemini·비상 모델 모두 실행하지 못해 Copilot({MODEL.split(':', 1)[1]})으로 다시 시도합니다.")
                    alert("gpt_emergency", "warn", f"{why} · 비상 모델({EMERGENCY_MODEL})도 실패 → Copilot({MODEL.split(':', 1)[1]})으로 실행",
                          model=MODEL, request_id=item["request_id"])
                    item.pop("recent_turns", None)
                    answer, conversation_id, duration = native_run(item, db, None)
        if conversation_id:
            save_conversation(db, conversation_id)
        db.execute("UPDATE runs SET status='completed',answer=?,conversation_id=?,updated_at=? WHERE request_id=?",
                   (answer, conversation_id, time.time(), item["request_id"]))
        db.commit()
        note_busy_run(item, True)
        # Z339 감시: 사용자가 직접 지시했는데 '읽기·계획 모드라 실행 권한이 없다'고 답했으면 권한 연결이 빠진 것 — 바로 알린다
        if USER_DIRECTED and USER_DIRECTED(item) and REFUSED.search(answer or ""):
            alert("user_instruction_refused", "warn", f"{WORKSPACE.name.replace('workspace-', '')} 사원이 사용자 직접 지시를 '실행 권한 없음(plan 모드)'으로 거절했습니다. "
                  "사용자 지시는 실행하도록 허용돼 있습니다(Z339). 인프라 확인: employees/ss_runtime.user_directed·실행 --mode. 사용자 할 일: 없습니다.",
                  request_id=item["request_id"])
        emit("result", status="completed", answer=answer, conversation_id=conversation_id, duration=duration)
        return 0
    except (Exception, KeyboardInterrupt) as error:
        reason = str(error) if str(error) in {
            "agent_interrupted", "interrupted_execution", "agent_timeout", "agent_failed", "agent_quota", "agent_server_busy",
            "agent_result_missing", "agent_empty_response", "conversation_busy",
        } else "agent_failed"
        if reason in ("agent_quota", "agent_server_busy") and len(set(CAUSES.values())) > 1:
            reason = "agent_quota_busy"   # 계정마다 원인이 다르면(한도 소진·서버 혼잡 섞임) 하나로 몰아 부르지 않는다
        if reason != "conversation_busy":   # 앞 요청 대기로 시작도 못 한 것은 모델 결과가 아니다
            note_busy_run(item, False, reason)
        if reason == "agent_quota":
            alert("all_quota", "urgent", f"주 계정과 백업 풀 계정이 모두 모델 사용량 한도에 걸려 요청을 처리하지 못했습니다(마지막 시도 {ACCOUNT}번 계정). "
                  "계정별 초기화 시각은 업무 웹 'AI 사원·모델'에 있습니다. "
                  + ("정기 업무는 다음 회차에 다시 시도합니다. 사용자 할 일: 없습니다(비상용 GPT도 남은 계정이 없거나 한도 — Claude로는 바꾸지 않습니다)."
                     if str(item["request_id"]).startswith("schedule:") else
                     "사용자 할 일: 초기화 뒤 같은 요청을 이 스레드에 다시 보내 주세요."),
                  account=ACCOUNT, request_id=item["request_id"])
        elif reason not in ("conversation_busy", "agent_interrupted"):
            why = {"agent_timeout": "시간 제한을 넘겨 멈췄습니다", "agent_result_missing": "최종 보고 없이 끝났습니다", "agent_server_busy": "주 계정·백업 계정 모두 Gemini 서버 혼잡(503·응답 정지 — 사용량 한도는 남아 있음)으로 실행하지 못했습니다",
                   "agent_quota_busy": "계정마다 막혀 실행하지 못했습니다(" + ", ".join(
                       f"{a}번 {'사용량 한도 소진' if c == 'agent_quota' else 'Gemini 서버 혼잡'}" for a, c in CAUSES.items()) + ")",
                   "agent_empty_response": "빈 답변으로 끝났습니다", "interrupted_execution": "실행 도중 끊겼습니다"}.get(
                reason, "정상 완료 신호 없이 끝났습니다")
            rid = str(item["request_id"])
            # 2026-10-12: 자동 작업(회귀 시험·확대 검색·신고 처리 등)까지 '같은 요청을 다시 보내 주세요'라고 안내하던 것 → 자동 작업은 할 일 없음
            # 2026-10-14: 사용자가 Slack에서 직접 보낸 요청이 아니면 모두 자동 작업(CTO 승인 실행·접수·시험·이행 후속 등에 '다시 보내 달라'고 안내하던 것)
            auto = item.get("source") != "slack" or rid.split(":", 1)[0] in ("schedule", "regress", "widen", "audit", "code", "cto", "cto-approve")
            alert("run_failed", "warn", f"작업이 {why}. 이미 기록된 결과는 남아 있습니다. "
                  + ("빠진 대상은 다음 회차에 다시 대상이 됩니다. 사용자 할 일: 없습니다." if rid.startswith("schedule:") else
                     "자동 작업이라 인프라가 원인을 확인해 다시 실행합니다. 사용자 할 일: 없습니다." if auto else
                     "사용자 할 일: 같은 요청을 이 스레드에 다시 보내 주세요 — 사원이 이미 한 부분을 확인하고 이어서 합니다.")
                  + f" 인프라 확인: failures.log({reason})",
                  account=ACCOUNT, request_id=item["request_id"])
            try:   # 실행 자체가 거부된 경우(예: 명령 인자 너무 김)도 원인이 남게 — 지시문·명령은 남기지 않고 종류·번호만
                with (WORKSPACE / "session" / "conversation" / "failures.log").open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "request_id": rid, "account": ACCOUNT, "reason": reason,
                                         "error_type": type(error).__name__, "errno": getattr(error, "errno", None)}, ensure_ascii=False) + "\n")
            except OSError:
                pass
        db.execute("UPDATE runs SET status='failed',error=?,updated_at=? WHERE request_id=? AND status!='completed'",
                   (reason, time.time(), item["request_id"]))
        db.commit()
        emit("result", status="failed", error=reason)
        return 1
    finally:
        lock_file.close()
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true", help="Read shared conversation history without calling the model")
    args = parser.parse_args()
    if args.history:
        db = connect_store()
        rows = db.execute("SELECT * FROM runs WHERE status='completed' ORDER BY started_at DESC LIMIT 50").fetchall()
        messages = []
        for row in reversed(rows):
            messages.append({"role": "user", "content": row["user_text"], "timestamp": int(row["started_at"]*1000), "source": row["source"]})
            messages.append({"role": "assistant", "content": row["answer"], "timestamp": int(row["updated_at"]*1000), "source": row["source"]})
        db.close()
        print(json.dumps(messages, ensure_ascii=False))
        raise SystemExit(0)
    request = json.load(sys.stdin)
    if not request.get("request_id") or not isinstance(request.get("text"), str):
        raise SystemExit("request_id and text are required")
    raise SystemExit(run(request))
