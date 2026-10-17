#!/usr/bin/env python3
"""스마트스토어 전용 AGY OpenAI 호환 프록시 (127.0.0.1:11435).

기존 ~/.hermes/scripts/agy_proxy.py(11434)는 다른 사원이 쓰므로 건드리지 않고,
스마트스토어 사원·Skyvern만 이 프록시를 쓴다. API 과금 없이 계정별 agy CLI만 호출한다.

기존 프록시와 다른 점:
- system 메시지와 전체 대화 이력을 프롬프트에 포함한다.
- base64 이미지(image_url)를 요청별 임시 폴더에 저장해 agy가 읽게 하고, 끝나면 삭제한다.
- agy 실패·한도 초과를 HTTP 오류(502/429/504)로 돌려준다. 정상 응답으로 위장하지 않는다.
- response_format(json)을 지시로 전달하고 코드 펜스를 벗긴다.
- tools → tool_calls: 도구 목록을 프롬프트로 주고 JSON 스키마로 호출 요청을 받아 OpenAI tool_calls로 돌려준다.
- 로그에는 프롬프트·응답 원문을 남기지 않는다(시간·계정·크기·상태만).

경로: /account/<계정>/v1/...   계정 직접 지정(Skyvern)
      /employee/<직원>/v1/...  ~/.config/smartstore/agy-accounts.conf 배정을 요청마다 읽는다(Hermes 프로필)
"""
import base64
import binascii
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

from ss_accounts import account_for, agent_bin, backup_for
from ss_alert import emit as alert

HOST = "127.0.0.1"
PORT = int(os.environ.get("SMARTSTORE_AGY_PROXY_PORT", "11435"))
TOKEN = os.environ.get("SMARTSTORE_AGY_PROXY_TOKEN", "")
TIMEOUT = int(os.environ.get("SMARTSTORE_AGY_TIMEOUT", "240"))
PER_ACCOUNT_CONCURRENCY = int(os.environ.get("SMARTSTORE_AGY_CONCURRENCY", "2"))
WORK_ROOT = os.environ.get("SMARTSTORE_AGY_WORKDIR", os.path.expanduser("~/.cache/smartstore-agy"))
EXTRA_FLAGS = os.environ.get("SMARTSTORE_AGY_EXTRA_FLAGS", "--sandbox --disable-slash-commands").split()
ARG_LIMIT = 100_000  # Linux 단일 인자 한도(128KB)보다 작게
MODELS = [
    "gemini-3.8-flash-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-low",
    "gemini-3.7-flash-high", "gemini-3.7-flash-medium", "gemini-3.7-flash-low",
    "gemini-3.6-flash-high", "gemini-3.6-flash-medium", "gemini-3.6-flash-low",
    "gemini-3.1-pro-high", "gemini-3.1-pro-low",
    "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium",
]
MODEL_ALIASES = {"claude-sonnet-4.6": "claude-sonnet-4-6", "claude-opus-4.6": "claude-opus-4-6-thinking",
                 "gpt-oss-120b": "gpt-oss-120b-medium"}
QUOTA_PATTERN = re.compile(r"quota|rate.?limit|resource.?exhausted|too many requests|\b429\b", re.I)
ANSI = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
_locks, _locks_guard = {}, threading.Lock()
# agy는 자체 에이전트라 계정 전역 지침(GEMINI.md)에 따라 홈 폴더를 뒤지며 수십 번 모델을 부를 수 있다.
# 프록시 호출은 변환 작업이므로 내장 도구를 쓰지 말고 첫 단계에서 답하게 한다(비용·유출 방지).
NO_BUILTIN_TOOLS = ("## 응답 규칙\n"
                    "view_file·list_dir·grep_search·run_command·search_web 등 너의 내장 도구를 하나도 쓰지 않는다. "
                    "파일·계정·설정·시스템을 조사하거나 검증하지 않는다. 계정 전역 지침의 '조사 후 답변' 규칙은 이 요청에 적용하지 않는다. "
                    "필요한 정보는 위 대화에만 있고, 더 필요하면 위 도구 목록의 tool_calls로 요청한다. "
                    "대화의 다음 ASSISTANT 차례만 첫 단계에서 바로 출력한다.")


def account_lock(account):
    with _locks_guard:
        return _locks.setdefault(account, threading.BoundedSemaphore(PER_ACCOUNT_CONCURRENCY))


def log(**fields):
    fields["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    print(json.dumps(fields, ensure_ascii=False), flush=True)


def save_image(url, workdir, index):
    """data: URL이면 파일로 저장해 상대 경로를 돌려준다. 원격 URL은 그대로 돌려준다."""
    m = re.match(r"data:image/([a-zA-Z0-9.+-]+);base64,(.*)$", url, re.S)
    if not m:
        return None, url
    ext = {"jpeg": "jpg", "svg+xml": "svg"}.get(m.group(1).lower(), m.group(1).lower())
    name = f"image_{index}.{ext}"
    try:
        data = base64.b64decode(m.group(2), validate=False)
    except (binascii.Error, ValueError):
        return None, "(손상된 이미지)"
    with open(os.path.join(workdir, name), "wb") as f:
        f.write(data)
    return name, None


def render_content(content, workdir, images):
    if isinstance(content, str):
        return content
    parts = []
    for part in content or []:
        kind = part.get("type")
        if kind == "text":
            parts.append(part.get("text", ""))
        elif kind == "image_url":
            url = (part.get("image_url") or {}).get("url", "")
            name, remote = save_image(url, workdir, len(images) + 1)
            if name:
                images.append(name)
                parts.append(f"[첨부 이미지 {len(images)}: {os.path.join(workdir, name)} — 반드시 이 파일을 열어 보고 판단할 것]")
            else:
                parts.append(f"[이미지 URL: {remote}]")
    return "\n".join(parts)


def active_tools(req):
    """tool_choice가 none이 아니면 (도구 목록, 지시문)을 돌려준다."""
    tools = [t["function"] for t in req.get("tools") or [] if t.get("type") == "function" and t.get("function")]
    choice = req.get("tool_choice", "auto")
    if not tools or choice == "none":
        return [], ""
    if choice == "required":
        return tools, "이번 차례에는 반드시 도구를 하나 이상 호출한다."
    if isinstance(choice, dict):
        name = (choice.get("function") or {}).get("name", "")
        return tools, f"이번 차례에는 반드시 {name} 도구를 호출한다."
    return tools, ""


def tool_schema(tools):
    return {"type": "object", "required": ["content", "tool_calls"], "properties": {
        "content": {"type": "string"},
        "tool_calls": {"type": "array", "items": {"type": "object", "required": ["name", "arguments"], "properties": {
            "name": {"type": "string", "enum": [t["name"] for t in tools]},
            "arguments": {"type": "string"},
        }}},
    }}


def build_prompt(req, workdir):
    images = []
    system, turns, names = [], [], {}
    for msg in req.get("messages", []):
        role = msg.get("role", "user")
        text = render_content(msg.get("content"), workdir, images)
        if role in ("system", "developer"):
            system.append(text)
        elif role == "tool":
            call_id = msg.get("tool_call_id", "")
            turns.append(f"### TOOL RESULT ({names.get(call_id, '')} {call_id})\n{text}")
        else:
            for call in msg.get("tool_calls") or [] if role == "assistant" else []:
                fn = call.get("function") or {}
                names[call.get("id", "")] = fn.get("name", "")
                text += f"\n[도구 호출 {call.get('id', '')}] {fn.get('name', '')} {fn.get('arguments', '')}"
            turns.append(f"### {role.upper()}\n{text}")
    tools, choice_rule = active_tools(req)
    blocks = []
    if system:
        blocks.append("## 시스템 지시(반드시 따를 것)\n" + "\n\n".join(system))
    blocks.append("## 대화\n" + "\n\n".join(turns))
    fmt = (req.get("response_format") or {}).get("type")
    if tools:
        catalog = "\n".join(f"- {t['name']}: {t.get('description', '').strip()}\n  parameters: "
                            + json.dumps(t.get("parameters", {}), ensure_ascii=False, separators=(",", ":"))
                            for t in tools)
        blocks.append("## 사용할 수 있는 도구\n" + catalog)
        blocks.append(
            "## 출력 형식\n설명·코드 펜스 없이 JSON 하나만 출력한다: "
            '{"content": "사용자에게 할 말", "tool_calls": [{"name": "도구 이름", "arguments": "인자 JSON 객체를 문자열로"}]}\n'
            "도구가 필요하면 tool_calls에 호출 요청을 넣는다(여러 개 가능). 호출 결과는 다음 차례에 TOOL RESULT로 받는다. "
            "도구 결과를 추측해 쓰지 않는다. 더 부를 도구가 없으면 tool_calls를 빈 배열로 하고 content에 최종 답변을 쓴다. "
            + choice_rule)
    elif fmt in ("json_object", "json_schema"):
        blocks.append("## 출력 형식\n설명·코드 펜스 없이 유효한 JSON 하나만 출력한다.")
    blocks.append(NO_BUILTIN_TOOLS)
    return "\n\n".join(blocks), images, fmt, tools


def strip_fences(text):
    m = re.match(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", text, re.S)
    return m.group(1) if m else text


def reply_object(text):
    """답 안의 {"content", "tool_calls"} 객체를 찾는다. 앞뒤 군더더기와 한 겹 더 감싼 JSON도 허용한다."""
    text = strip_fences(text.strip())
    decoder = json.JSONDecoder()
    for start in [m.start() for m in re.finditer(r"\{", text)][:20]:
        try:
            data, _ = decoder.raw_decode(text, start)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and ("content" in data or "tool_calls" in data):
            inner = data.get("content")
            if not data.get("tool_calls") and isinstance(inner, str) and inner.lstrip().startswith("{"):
                data = reply_object(inner) or data
            return data
    return None


def parse_tool_reply(text):
    """모델의 JSON 답을 (content, OpenAI tool_calls, 파싱 성공 여부)로 바꾼다. JSON이 아니면 일반 답으로 본다."""
    data = reply_object(text)
    if data is None:
        return text, [], False
    calls = []
    for call in data.get("tool_calls") or []:
        args = call.get("arguments", "{}")
        if isinstance(args, str):
            try:
                args = json.loads(args or "{}")
            except json.JSONDecodeError:
                args = {"_raw": args}
        calls.append({"id": f"call_{uuid.uuid4().hex[:24]}", "type": "function",
                      "function": {"name": call.get("name", ""), "arguments": json.dumps(args, ensure_ascii=False)}})
    return str(data.get("content") or ""), calls, True


def run_agy(account, model, prompt, workdir, json_schema):
    cmd = [agent_bin(account), *EXTRA_FLAGS,
           "--model", model, "--output-format", "json", "--add-dir", workdir]
    if json_schema:
        schema_path = os.path.join(workdir, "schema.json")
        with open(schema_path, "w") as f:
            json.dump(json_schema, f)
        cmd += ["--json-schema", schema_path]
    if len(prompt.encode()) > ARG_LIMIT:
        with open(os.path.join(workdir, "prompt.md"), "w") as f:
            f.write(prompt)
        prompt = (f"{os.path.join(workdir, 'prompt.md')} 파일 하나만 view_file로 끝까지 읽고, 그 안의 지시·도구 목록·출력 형식에 따라 "
                  "대화의 다음 ASSISTANT 차례만 출력하라. 그 파일 외에는 " + NO_BUILTIN_TOOLS.split("\n", 1)[1])
    cmd.append(f"-p={prompt}")
    return subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT, cwd=workdir)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass

    def _send(self, code, payload, stream=False, include_usage=False):
        body = json.dumps(payload, ensure_ascii=False).encode()
        if stream and code == 200:
            choice = payload["choices"][0]
            delta = {"role": "assistant", **{k: v for k, v in choice["message"].items() if k != "role"}}
            for i, call in enumerate(delta.get("tool_calls") or []):
                call["index"] = i
            chunk = dict(payload, object="chat.completion.chunk")
            chunk.pop("usage", None)
            chunk["choices"] = [{"index": 0, "delta": delta, "finish_reason": choice["finish_reason"]}]
            chunks = [chunk]
            if include_usage:
                chunks.append(dict(chunk, choices=[], usage=payload["usage"]))
            body = b"".join(b"data: " + json.dumps(c, ensure_ascii=False).encode() + b"\n\n" for c in chunks)
            body += b"data: [DONE]\n\n"
        self.send_response(code)
        self.send_header("Content-Type", "text/event-stream" if stream and code == 200 else "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code, kind, message):
        self._send(code, {"error": {"type": kind, "message": message, "code": code}})

    def _route(self):
        """(계정, 직원 또는 None, 엔드포인트). 계정을 알 수 없으면 계정은 None."""
        m = re.match(r"^/(account|employee)/([^/]+)(/v1/.*)$", self.path.split("?")[0])
        if not m:
            return None, None, None
        kind, name, endpoint = m.groups()
        try:
            if kind == "employee":
                return account_for(name), name, endpoint
            agent_bin(name)
            return name, None, endpoint
        except LookupError:
            return None, name if kind == "employee" else None, endpoint

    def _authorized(self):
        return not TOKEN or self.headers.get("Authorization", "") == f"Bearer {TOKEN}"

    def do_GET(self):
        account, _, endpoint = self._route()
        if endpoint == "/v1/models" and account:
            return self._send(200, {"object": "list", "data": [
                {"id": m, "object": "model", "created": 0, "owned_by": f"agy-{account}"} for m in MODELS]})
        if self.path == "/health":
            return self._send(200, {"status": "ok"})
        self._error(404, "not_found", "unknown path")

    def do_POST(self):
        account, employee, endpoint = self._route()
        if not self._authorized():
            return self._error(401, "unauthorized", "invalid token")
        if not account or endpoint != "/v1/chat/completions":
            return self._error(404, "not_found", "unknown account, employee or endpoint")
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._error(400, "invalid_request", "invalid json")
        model = MODEL_ALIASES.get(req.get("model", ""), req.get("model") or "gemini-3.8-flash-high")
        model = model.split("/", 1)[-1]  # litellm의 openai/ 접두사 제거
        os.makedirs(WORK_ROOT, mode=0o700, exist_ok=True)
        workdir = tempfile.mkdtemp(prefix="req-", dir=WORK_ROOT)
        started = time.time()
        status, code, usage, images, prompt, turns, tools, calls = "error", 502, {}, [], "", 0, [], []
        parsed = None
        try:
            prompt, images, fmt, tools = build_prompt(req, workdir)
            schema = None
            if tools:
                schema = tool_schema(tools)
            elif fmt == "json_schema":
                schema = (req.get("response_format", {}).get("json_schema") or {}).get("schema")
            tried = []
            while True:
                lock = account_lock(account)
                if not lock.acquire(timeout=TIMEOUT):
                    code, status = 503, "busy"
                    return self._error(503, "busy", f"agy-{account} is busy")
                try:
                    res = run_agy(account, model, prompt, workdir, schema)
                finally:
                    lock.release()
                out = ANSI.sub("", res.stdout or "").strip()
                err = ANSI.sub("", res.stderr or "").strip()
                try:
                    result = json.loads(out.splitlines()[-1]) if out else {}
                except json.JSONDecodeError:
                    result = {}
                failed = res.returncode != 0 or not isinstance(result, dict) or result.get("status") != "SUCCESS"
                tried.append(account)
                backup = backup_for(account) if failed and QUOTA_PATTERN.search(out + err) else None
                if not backup or backup in tried:
                    break
                log(event="quota_failover", account=account, backup=backup, employee=employee)
                alert("quota_failover", "warn", f"[프록시] 모델 계정 agy-{account} 사용량 한도 → 백업 agy-{backup}로 전환",
                      account=account, backup=backup, employee=employee)
                account = backup  # 사용량 한도: [backup] 계정으로 한 번 더
            text = result.get("response", "") if isinstance(result, dict) else ""
            usage = result.get("usage", {}) if isinstance(result, dict) else {}
            turns = result.get("num_turns", 0) if isinstance(result, dict) else 0
            if res.returncode != 0 or result.get("status") != "SUCCESS" or not text.strip():
                detail = (result.get("error") or result.get("status") or err or out or "empty response")
                detail = str(detail)[:500]
                code = 429 if QUOTA_PATTERN.search(detail + err) else 502
                status = "quota" if code == 429 else "agy_failed"
                if code == 429:
                    alert("all_quota", "urgent", f"[프록시] 모델 계정 사용량 한도(백업 포함 agy-{account})로 요청 실패. 몇 분 뒤 풀림",
                          account=account, employee=employee)
                return self._error(code, status, f"agy-{account} failed: {detail}")
            if tools:
                text, calls, parsed = parse_tool_reply(text)
            elif fmt in ("json_object", "json_schema"):
                text = strip_fences(text.strip())
            message = {"role": "assistant", "content": text if text or not calls else None}
            if calls:
                message["tool_calls"] = calls
            code, status = 200, "ok"
            self._send(200, {
                "id": f"smartstore-agy-{account}-{int(started)}", "object": "chat.completion",
                "created": int(started), "model": model,
                "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if calls else "stop"}],
                "usage": {"prompt_tokens": usage.get("input_tokens", 0),
                          "completion_tokens": usage.get("output_tokens", 0),
                          "total_tokens": usage.get("total_tokens", 0)},
            }, stream=bool(req.get("stream")),
                include_usage=bool((req.get("stream_options") or {}).get("include_usage")))
        except subprocess.TimeoutExpired:
            code, status = 504, "timeout"
            self._error(504, "timeout", f"agy-{account} exceeded {TIMEOUT}s")
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
            log(account=account, employee=employee, model=model, status=status, http=code,
                seconds=round(time.time() - started, 2), prompt_chars=len(prompt), images=len(images),
                tokens=usage.get("total_tokens", 0), turns=turns, tools=len(tools),
                tool_calls=[c["function"]["name"] for c in calls], parsed=parsed)


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    log(event="start", host=HOST, port=PORT, auth=bool(TOKEN))
    Server((HOST, PORT), Handler).serve_forever()
