# AI 사원·스킬 공개 카탈로그

2026-10-06 서버의 AI 사원 화면에서 확인되는 역할, 팀, 모델 라벨과 연결 스킬 이름만
기록한다. 이 문서는 공개 카탈로그이며 스킬 본문, 실행 명령, 계정, 작업공간, 파일 경로,
사용량 원문, 고객·주문·금융 자료는 포함하지 않는다.

`↗` 표시는 공용 또는 공유 계약을 참조하는 스킬이라는 뜻이다. 실제 연결 여부와
실행 상태는 운영 서버의 비공개 설정에서 관리한다.

| 사원 | 프로필 | 팀 | 모델 라벨 | 연결 스킬 |
|---|---|---|---|---|
| Olivia | `ss-coo` | 지휘본부 | GitHub Copilot · GPT-6 Luna | `competitor-price-audit`, `legacy-ledger-reconcile`, `loaded-discovery-v1`, `naver-price-compare`, `observe-offer-v1`, `ss-audit-record`, `ss-business-api`, `ss-business-context`, `ss-core-policy`, `ss-data-protection`, `ss-escalation`, `ss-handoff-protocol`, `ss-incident-retry`, `ss-schedule-discipline`, `ss-slack-report`, `ss-untrusted-input`, `ss-work-handoff`, `steam-list-price`, `vendor-gmg`, `vendor-loaded`, `vendor-playsum`, `vendor-yuplay`, `verify-evidence-crosscheck` |
| Ethan | `ss-cto` | 지휘본부 | GitHub Copilot · GPT-6 Luna | `review-agent-health`, `ss-audit-record`, `ss-business-api`, `ss-business-context`, `ss-core-policy`, `ss-data-protection`, `ss-escalation`, `ss-handoff-protocol`, `ss-incident-retry`, `ss-schedule-discipline`, `ss-slack-report`, `ss-untrusted-input`, `ss-work-handoff` |
| Sophia | `ss-cfo` | 지휘본부 | GitHub Copilot · GPT-6 Luna | `competitor-news-monitor`, `product-price-monitor`, `smartstore-cfo-advisor`, `ss-audit-record`, `ss-business-api`, `ss-business-context`, `ss-core-policy`, `ss-data-protection`, `ss-escalation`, `ss-handoff-protocol`, `ss-incident-retry`, `ss-schedule-discipline`, `ss-slack-report`, `ss-untrusted-input`, `ss-work-handoff` |
| Daniel | `ss-cso` | 지휘본부 | GitHub Copilot · GPT-6 Luna | `government-support-survey`, `policy-loan-survey`, `ss-audit-record`, `ss-business-api`, `ss-business-context`, `ss-core-policy`, `ss-data-protection`, `ss-escalation`, `ss-handoff-protocol`, `ss-incident-retry`, `ss-schedule-discipline`, `ss-slack-report`, `ss-untrusted-input`, `ss-work-handoff` |
| Mia | `ss-platform` | 플랫폼팀 | Gemini 3.8 Flash (High) | `ledger-store-cycle`, `smartstore-brand-assets`, `smartstore-cs-records`, `smartstore-product-listing`, `smartstore-seller-center`, `smartstore-stock-safety`, `store-rebuild-migration` |
| Noah | `ss-sales-sourcing` | 영업팀 | Gemini 3.8 Flash (High) | `legacy-ledger-reconcile`, `loaded-discovery-v1`, `observe-offer-v1`, `steam-list-price`, `vendor-gmg`, `vendor-loaded`, `vendor-playsum`, `vendor-yuplay` |
| Ava | `ss-sales-market` | 영업팀 | Gemini 3.8 Flash (High) | `naver-price-compare`, `observe-offer-v1` |
| Emma | `ss-order-watch` | 구매팀 | Gemini 3.8 Flash (High) | `order-event-triage` |
| Lucas | `ss-purchase-monitor` | 구매팀 | Gemini 3.8 Flash (High) | `account-health-v1` |
| James | `ss-purchase-main` | 구매팀 | Gemini 3.8 Flash (High) | `purchase-order-v1`, `vendor-loaded-v1` |
| Grace | `ss-purchase-backup` | 구매팀 | Gemini 3.8 Flash (High) | `purchase-order-v1`, `vendor-loaded-v1` |
| Leo | `ss-delivery` | 구매팀 | Gemini 3.8 Flash (High) | `key-delivery-v1` |
| Henry | `ss-accounting-naver` | 회계팀 | Gemini 3.8 Flash (High) | `accounting-web-v1`, `naver-sales-settlement`, `purchase-sales-reconcile`, `tax-invoice-monthly`, `vat-return-yearly` |
| Nora | `ss-accounting-web` | 회계팀 | Gemini 3.8 Flash (High) | `accounting-documents`, `accounting-web-v1`, `card-purchase-import`, `deposit-match`, `month-close` |
| Ella | `ss-bookkeeping` | 경리팀 | Gemini 3.8 Flash (High) | `accounting-web-v1`, `jangbu-standardize` |
| Mason | `ss-infra-ops` | 인프라팀 | Gemini 3.8 Flash (High) | `smartstore-infra-runbook`, `ss-approved-deploy`, `ss-service-health` |
| Liam | `ss-infra-data` | 인프라팀 | Gemini 3.8 Flash (High) | `dr-terraform`, `infra`, `internal-cloud-storage`, `internal-disk-optimizer`, `internal-network-firewall`, `internal-package-manager`, `internal-rsync`, `oci-blockstorage`, `oci-compute`, `oci-iam`, `oci-network`, `oci-os-monitoring`, `oci-overview`, `oci-safeops`, `ss-backup-restore-check` |

## 공개 경계

- 공개 저장소에는 역할·팀·모델 라벨과 스킬 이름만 둔다.
- 실제 스킬 원문, 브라우저 절차, 매입처별 운영 지침, 환경값, 자격증명과 세션은
  운영 서버에만 둔다.
- 구매·발송·가격·상품·원장·백업·복원 작업은 이 카탈로그만으로 실행할 수 없다.
- 스킬 연결 변경은 사용자 승인과 인프라팀의 검증·배포 경계를 따른다.
