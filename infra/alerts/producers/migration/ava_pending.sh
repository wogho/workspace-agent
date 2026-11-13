#!/bin/bash
# 공개 예시: 내부 상품·관측 데이터와 브라우저 연결정보는 운영 환경에 둔다.
# 대기 행을 묶어 비공개 시장검증 런타임에 넘기고, 중단·완료 사건만 기록한다.
. "$(dirname "$0")/common.sh"; T0=$(date +%s); k=0
while :; do
  PEND="${PENDING_REVIEW_ROWS:-}"
  if [ -z "$PEND" ]; then
    echo "===== 시장검증 대기 행 없음"
    break
  fi
  k=$((k+1)); echo "===== 시장검증 $k $(date +%H:%M): $PEND"
  OUT=$(printf '%s' "{\"request_id\":\"market-review-$(date +%s)\",\"source\":\"migration\",\"text\":\"비공개 시장검증 런타임에서 대기 행을 처리하고 결과를 기록하세요.\"}" | run "${MARKET_REVIEW_EMPLOYEE:-market-review}")
  echo "$OUT"
  if echo "$OUT" | grep -q "QUIZ_STOP\|접근 제한\|경고"; then
    echo "===== 시장검증 중단"
    STOP="보안 퀴즈·경고로 중단"
    "$HOME/smartstore-infra/bin/ss_alert.py" market_review_blocked urgent "시장검증이 보안 퀴즈·경고로 중단됨"
    break
  fi
  if echo "$OUT" | grep -q "RUN FAILED"; then
    echo "===== 시장검증 실행 실패"
    STOP="실행 실패로 중단"
    break
  fi
  PENDING_REVIEW_ROWS=""
done
echo "===== 시장검증 종료 total $(( $(date +%s)-T0 ))s"
"$HOME/smartstore-infra/bin/ss_alert.py" market_review_done info "시장검증 ${STOP:-대기 행을 모두 처리}: $k묶음"
