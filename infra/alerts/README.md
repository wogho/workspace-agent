# 운영 알림 계약

이 디렉터리는 서비스 사건을 파일 기반 outbox에 기록하고, 주기적인 전송기가
자동화 워크플로 웹훅으로 전달하는 공개 가능한 구조만 담는다.

## 흐름

```text
서비스·직원 런타임·배치·heartbeat
        │
        ▼
ss_alert.py ──> alerts.jsonl ──> ss_alert_watch.py ──> automation webhook
                                                        │
                                                        ▼
                                                  팀 알림 채널
```

## 포함된 표면

- `bin/ss_alert.py`: 사건을 JSON Lines 한 줄로 append하는 비차단 기록기
- `bin/ss_alert_watch.py`: cursor와 quiet 상태를 사용해 새 사건을 묶어 전송하는 outbox worker
- `systemd/ss-alert-watch.*`: 1분 주기 실행 계약
- `producers/`: 대화 런타임, 모델 프록시, heartbeat, 마이그레이션 배치의 알림 호출 지점

웹훅 토큰과 URL, 자동화 플랫폼의 workflow·credential·실행 DB, 실제 알림 로그와
cursor 상태 파일은 운영 환경에만 둔다. 공개 예시의 배치 파일은 상품·고객·계정·
브라우저 연결정보를 포함하지 않도록 일반화했다.
