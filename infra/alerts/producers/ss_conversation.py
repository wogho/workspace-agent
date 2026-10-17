#!/usr/bin/env python3
"""Smartstore 직원 공통 대화 엔진: 직원 1명 = agy 영구 대화 1개 (Slack·Claw3D 공유).

공통 직원 런타임에서 사용하는 대화 상태·재시도 패턴을 담은 공개 예시다.
agy HTTP 프록시는 이력을 버리므로 같은 계정의 native 프로토콜을 --conversation으로 이어서 쓴다.
"""
import argparse
import fcntl
import json
import re
import os
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
TIMEOUT = float(os.environ.get("SS_RUN_TIMEOUT_SECONDS", "900"))
AGENT_MODE = "plan"
OUTPUT_SCHEMA = None


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


def save_conversation(db, conversation_id):
    db.execute("INSERT OR REPLACE INTO metadata VALUES ('conversation_id', ?)", (conversation_id,))
    db.execute("INSERT OR REPLACE INTO metadata VALUES ('account', ?)", (ACCOUNT,))


def resume_or_recap(db, item):
    """같은 계정의 대화 ID를 돌려준다. 없으면 최근 기록을 item에 담아 새 대화가 맥락을 잇게 한다."""
    meta = dict(db.execute("SELECT key, value FROM metadata").fetchall())
    if meta.get("conversation_id") and meta.get("account") == ACCOUNT:
        return meta["conversation_id"]
    rows = db.execute("SELECT user_text, answer FROM runs WHERE status='completed' "
                      "ORDER BY started_at DESC LIMIT 6").fetchall()
    item["recent_turns"] = [{"user": r["user_text"][-1500:], "assistant": r["answer"][-1500:]} for r in reversed(rows)]
    return None


def build_prompt(item):
    raise RuntimeError("prompt must be configured by ss_runtime")


def stop_process(proc):
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=5)
    except ProcessLookupError:
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
    """운영 알림(ss_alert → automation workflow). 실패해도 업무는 계속한다."""
    try:
        import pwd as _pwd  # agy가 아닌 이 프로세스는 실제 홈이지만, 안전하게 pwd로 찾는다
        sys.path.insert(0, str(Path(_pwd.getpwuid(os.getuid()).pw_dir) / "smartstore-infra/bin"))
        from ss_alert import emit
        emit(kind, severity, text, employee=WORKSPACE.name.replace("workspace-", ""), **fields)
    except Exception:
        pass


QUOTA_PATTERN = re.compile(r"RESOURCE_EXHAUSTED|quota reached|rate.?limit|too many requests|\b429\b", re.I)
BACKUP_ACCOUNT = None   # ss_runtime이 [backup] 계정을 넣는다(없으면 재시도하지 않음)
SWITCH_ACCOUNT = None   # ss_runtime이 넣는 함수: 계정을 바꿀 때 실행 파일·브라우저 연결을 맞춘다


def native_run(item, db, conversation_id):
    command = [
        AGENT_BIN, "--model", MODEL, "--sandbox", *([] if SLASH_COMMANDS else ["--disable-slash-commands"]), "--mode", AGENT_MODE,
        "--output-format", "stream-json", "--print-timeout", f"{int(TIMEOUT)}s",
    ]
    if OUTPUT_SCHEMA is not None:
        command.extend(["--json-schema", json.dumps(OUTPUT_SCHEMA)])
    if conversation_id:
        command.extend(["--conversation", conversation_id])
    command.extend(["-p", build_prompt(item)])
    started = time.monotonic()
    proc = subprocess.Popen(
        command, cwd=WORKSPACE, stdin=subprocess.DEVNULL,
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

    try:
        while selector.get_map():
            now = time.monotonic()
            if now - started > TIMEOUT + 10:
                raise TimeoutError("agent_timeout")
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
                if key.data == "stderr":
                    buffers["stderr"] = buffers["stderr"][-16000:]
                    continue
                while b"\n" in buffers["stdout"]:
                    line, buffers["stdout"] = buffers["stdout"].split(b"\n", 1)
                    consume(line)
        code = proc.wait(timeout=5)
        if (code or not result or result.get("status") != "SUCCESS") and QUOTA_PATTERN.search(
                buffers["stderr"].decode("utf-8", "ignore") + json.dumps(result or {}, ensure_ascii=False)):
            raise RuntimeError("agent_quota")
        if code or not result or result.get("status") != "SUCCESS":
            # 원인 추적용: 종료 코드·결과 상태·키 이름만 남긴다(본문·stderr 원문은 남기지 않음).
            with open(STATE_DIR / "failures.log", "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "request_id": item.get("request_id"),
                                     "account": ACCOUNT, "exit_code": code, "result_status": (result or {}).get("status"),
                                     "result_keys": sorted((result or {}).keys()),
                                     "stderr_tail_kind": QUOTA_PATTERN.search(buffers["stderr"].decode("utf-8", "ignore")) is not None},
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
        current = resume_or_recap(db, item)
        try:
            answer, conversation_id, duration = native_run(item, db, current)
        except RuntimeError as error:
            if str(error) != "agent_quota" or not BACKUP_ACCOUNT or not SWITCH_ACCOUNT:
                raise
            # 계정 사용량 한도: 백업 계정으로 한 번 더(대화 ID는 계정별이라 최근 기록 요약으로 이어받는다)
            emit("progress", stage="quota", text="모델 계정 사용량 한도에 걸려 백업 계정으로 다시 시도합니다.")
            alert("quota_failover", "warn", f"모델 계정 agy-{ACCOUNT} 사용량 한도 → 백업 agy-{BACKUP_ACCOUNT}로 전환",
                  account=ACCOUNT, backup=BACKUP_ACCOUNT, request_id=item["request_id"])
            SWITCH_ACCOUNT(BACKUP_ACCOUNT)
            item.pop("recent_turns", None)
            current = resume_or_recap(db, item)
            answer, conversation_id, duration = native_run(item, db, current)
        if conversation_id:
            save_conversation(db, conversation_id)
        db.execute("UPDATE runs SET status='completed',answer=?,conversation_id=?,updated_at=? WHERE request_id=?",
                   (answer, conversation_id, time.time(), item["request_id"]))
        db.commit()
        emit("result", status="completed", answer=answer, conversation_id=conversation_id, duration=duration)
        return 0
    except (Exception, KeyboardInterrupt) as error:
        reason = str(error) if str(error) in {
            "agent_interrupted", "interrupted_execution", "agent_timeout", "agent_failed", "agent_quota",
            "agent_result_missing", "agent_empty_response", "conversation_busy",
        } else "agent_failed"
        if reason == "agent_quota":
            alert("all_quota", "urgent", f"모델 계정 사용량 한도(백업 포함 agy-{ACCOUNT})로 요청 실패. 몇 분 뒤 풀림",
                  account=ACCOUNT, request_id=item["request_id"])
        elif reason not in ("conversation_busy", "agent_interrupted"):
            alert("run_failed", "warn", f"요청 실패({reason}) — 결과는 기록됐을 수 있음, 확인 필요",
                  account=ACCOUNT, request_id=item["request_id"])
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
