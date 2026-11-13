# 마이그레이션 배치 스크립트 공용 함수.
# run <사원>: 표준입력의 요청 JSON으로 사원을 한 번 부르고 결과를 출력한다.
# 런타임이 한도(429) 때 구성된 백업 계정으로 먼저 넘어간다. 백업까지 한도에 걸려 실패하면(agent_quota)
# 로그의 "Resets in"만큼 기다렸다가 요청 ID를 바꿔 최대 5번 다시 부른다(같은 ID는 이전 실패가 그대로 돌아온다).
run() {
  local emp=$1 req out attempt=1 wait
  req=$(cat)
  # 묶음마다 새 대화로 시작한다(긴 대화가 쌓이면 끝에 실패로 떨어졌다, 2026-09-27). 최근 6건 요약은 런타임이 자동으로 이어준다.
  sqlite3 ~/.hermes/workspace-$emp/session/conversation/runtime.sqlite3 "delete from metadata where key='conversation_id'" 2>/dev/null
  while :; do
    out=$(printf '%s' "$req" | SS_RUN_TIMEOUT_SECONDS=3600 timeout 3700 ~/.hermes/hermes-agent/venv/bin/python \
      ~/smartstore-infra/employees/ss_runtime.py --employee "$emp" | grep -E '"(result)"' | python3 -c "
import sys,json
for l in sys.stdin:
    e=json.loads(l); print('RESULT:',e.get('status'),e.get('duration'),'\n',(e.get('answer') or e.get('error'))[-6000:])")
    echo "$out"
    echo "$out" | grep -q "agent_failed\|agent_quota" || return 0
    wait=$(python3 - <<'EOF'
import glob,os,re,time
logs=[f for f in glob.glob(os.path.expanduser('~/.agy/accounts/*/.gemini/antigravity-cli/log/cli-*.log')) if time.time()-os.path.getmtime(f)<900]
for f in sorted(logs,key=os.path.getmtime,reverse=True):
    m=re.findall(r'RESOURCE_EXHAUSTED.*?Resets in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?',open(f,errors='ignore').read())
    if m:
        h,mi,s=m[-1]; print(int(h or 0)*3600+int(mi or 0)*60+int(float(s or 0))+60); break
EOF
)
    if [ -z "$wait" ] || [ $attempt -ge 5 ]; then
      echo "===== RUN FAILED ($emp, 시도 $attempt, 사용량 한도 아님 또는 재시도 소진)"
      ~/smartstore-infra/bin/ss_alert.py migration_run_failed warn "마이그레이션 실행 실패($emp, 시도 $attempt). 기록이 남았는지 확인 필요" employee=$emp
      return 1
    fi
    echo "===== QUOTA WAIT ${wait}s ($emp, 시도 $attempt) $(date +%H:%M)"
    sleep "$wait"; attempt=$((attempt+1))
    req=$(printf '%s' "$req" | python3 -c "import sys,json; d=json.load(sys.stdin); d['request_id']=d['request_id'].split('-retry')[0]+'-retry$attempt'; print(json.dumps(d,ensure_ascii=False))")
  done
}
