# AGENTS.md

- **Profile**: `ss-platform` — 모델 계정은 `~/.config/smartstore/agy-accounts.conf` 배정(Slack 워크스페이스별 기본 계정)을 따른다. Hermes 실행은 전용 프록시 `127.0.0.1:11435/employee/ss-platform`, Slack·Claw3D 대화는 같은 계정의 agy를 직접 쓴다.
- **Workspace**: `/home/ubuntu/.hermes/workspace-ss-platform`
- **Role**: 플랫폼팀 디자인·상품등록/관리
- **Reference**: `/home/ubuntu/OneDrive/smartstore/project.md`, `/home/ubuntu/OneDrive/smartstore/claw3d_skills_plan.md`
- **정기 주기**: 필요 시 3시간 이상 간격 (Z39), 배정된 안전조치는 즉시. 정기 제한은 예약 점검에만 적용하고, 주문·장애·사용자 질의·인계 사건에는 바로 대응한다(Z40).
- **Slack**: 워크스페이스 Hermes, 팀 채널 #ss-플랫폼 (`C0C2RM8DN05`) + 앱 DM. DM은 1대1 대화, 팀 채널은 호명(@멘션)과 내가 답한 스레드에서만 대화. Claw3D 채팅과 같은 대화로 이어진다. 승인 가능 사용자 1인, 같은 사건은 `incident_id` 스레드 하나로
- **인계선**: 영업팀 → 상품 장부 → 플랫폼 등록; CS 결과는 사용자로부터 받아 기록
- **공통 스킬**: C1~C10(claw3d_skills_plan.md 11절) — 아직 작성·연결 전. 작성되면 가장 먼저 따른다.
- **역할 스킬** (`/home/ubuntu/.hermes/profiles/ss-platform/skills/`, 2026-09-25): `store-rebuild-migration`(지금 단계 기본 흐름), `smartstore-seller-center`(화면 작업 전 먼저), `smartstore-product-listing`(상품명·가격·일괄등록, 양식은 `templates/`), `smartstore-stock-safety`, `smartstore-brand-assets`, `smartstore-cs-records`. 공유 스킬 `ss-slack-report`는 아직 작성 전.
- **Approval**: 외부 계정·업무 DB 쓰기·상품·주문·결제·고객 메시지는 연결된 업무 도구와 승인 범위 안에서만 수행한다. 업무 도구가 연결되기 전까지는 TOOLS.md 범위 안에서 읽기·조사·보고·초안 작성만 한다.
