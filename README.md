# Workspace Agent

<p align="center">
  <img src="docs/assets/workspace-agent-hero.svg" alt="Workspace Agent technical architecture" width="100%">
</p>

<p align="center">
  <strong>Role-based AI operations architecture</strong><br>
  <sub>Reasoning, workflow automation, browser execution, and human decisions separated by explicit boundaries.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AI%20Employees-17-6C5CE7?style=for-the-badge" alt="17 AI employees" />
  <img src="https://img.shields.io/badge/Source%20of%20Truth-PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL source of truth" />
  <img src="https://img.shields.io/badge/Workflow-n8n-EA4B71?style=for-the-badge&logo=n8n&logoColor=white" alt="n8n workflow orchestration" />
  <img src="https://img.shields.io/badge/Automation-Self--hosted-111827?style=for-the-badge&logo=docker&logoColor=white" alt="Self-hosted automation" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-D22128?style=for-the-badge&logo=apache&logoColor=white" alt="Apache License 2.0" /></a>
</p>

<p align="center">
  <a href="#기술-스택">기술 스택</a> ·
  <a href="#전체-구성도">구성도</a> ·
  <a href="#cloudflare-turnstile-대응-구성">Turnstile 대응</a> ·
  <a href="#17명-ai-직원-조직">AI 직원 조직</a> ·
  <a href="#공개-범위와-보안-정책">공개 범위</a>
</p>

<p align="center">
  <a href="https://smartstore.naver.com/opengamingworld">
    <img src="https://img.shields.io/badge/Smartstore-오픈게이밍월드-03C75A?style=for-the-badge&logo=naver&logoColor=white" alt="Naver Smartstore 오픈게이밍월드" />
  </a>
  <a href="https://noong2.tistory.com/">
    <img src="https://img.shields.io/badge/Tistory-눙이의 인프라 메모장-F15A24?style=for-the-badge" alt="눙이의 인프라 메모장" />
  </a>
</p>

Smartstore 운영을 위한 AI 직원 조직과 Hermes·Claw3D 연동 구성을 공개 기술 문서로 정리한 저장소다.
이 저장소의 핵심은 특정 쇼핑몰의 영업자료가 아니라, **역할 기반 AI 직원**, **상태 중심 업무 코어**,
**브라우저 자동화 경계**, **이벤트 연결**, **운영 문서화**를 하나의 구조로 설계한 기술적 접근이다.

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>17</strong><br><sub>역할 기반 AI 직원</sub></td>
      <td align="center"><strong>5</strong><br><sub>표준 직원 문서</sub></td>
      <td align="center"><strong>1</strong><br><sub>DB 정본</sub></td>
      <td align="center"><strong>3</strong><br><sub>브라우저 실행 단계</sub></td>
      <td align="center"><strong>4</strong><br><sub>agy Gemini 계정 수</sub></td>
      <td align="center"><strong>0</strong><br><sub>공개 운영 비밀</sub></td>
    </tr>
  </table>
</div>

## 프로젝트 요약

이 시스템은 17명의 역할별 AI 직원이 상품·주문·이행·배송·회계·인프라 업무를 분리해서 판단하도록 구성한다.
AI 대화나 Kanban 카드가 거래의 기준 기록이 되지 않도록 PostgreSQL을 정본으로 두고, n8n은 연결·예약·알림,
Hermes는 역할별 판단, 브라우저 실행기는 화면 조작, Slack은 진행상황과 사용자 결정을 전달하는 계층으로 제한한다.

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <strong><a href="https://smartstore.naver.com/opengamingworld">Smartstore</a></strong><br>
        <sub>상품·주문·배송이 연결 상거래 표면</sub>
      </td>
      <td align="center" width="50%">
        <strong><a href="https://noong2.tistory.com/">Tistory Blog</a></strong><br>
        <sub>프로젝트 운영 기록·콘텐츠 채널</sub>
      </td>
    </tr>
  </table>
</div>

<div align="center">
  <table>
    <tr>
      <td width="50%" valign="top">
        <strong>공개 아키텍처</strong><br>
        <sub>직원 역할·권한·인계·상태 연동 구성도</sub>
      </td>
      <td width="50%" valign="top">
        <strong>비공개 실행 경계</strong><br>
        <sub>토큰·세션·거래 데이터·이행 스킬 런타임</sub>
      </td>
    </tr>
  </table>
</div>

이 저장소는 다음을 공개한다.

- AI 직원 17명의 역할·권한·인계·중단 조건 문서
- Hermes 프로필의 비민감 표시 메타데이터
- Claw3D 직원 레지스트리와 작업공간의 논리적 구조
- 직원별 Slack App Manifest와 Socket Mode 연동 계약
- 시스템 구성도, 데이터 흐름, 보안·민감정보 제외 원칙

비즈니스 거래 데이터, 인증정보, 계정 식별자, 고객정보, 외부 판매 채널별 자료, 주문이행팀 스킬 본문은 공개하지 않는다.

## 기술 스택

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>기술<br/>스택</strong></td>
      <td align="center"><img src="https://cdn.simpleicons.org/django/092E20" width="32" alt="Django" /><br/><sub>Django</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/DRF-A30000?style=flat-square&logo=django&logoColor=white" height="32" alt="Django REST framework" /><br/><sub>DRF</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/react/61DAFB" width="32" alt="React" /><br/><sub>React</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/typescript/3178C6" width="32" alt="TypeScript" /><br/><sub>TypeScript</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/vite/646CFF" width="32" alt="Vite" /><br/><sub>Vite</sub></td>
    </tr>
    <tr>
      <td align="center"><strong>데이터·<br/>워크플로</strong></td>
      <td align="center"><img src="https://cdn.simpleicons.org/postgresql/4169E1" width="32" alt="PostgreSQL" /><br/><sub>PostgreSQL</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/n8n/EA4B71" width="32" alt="n8n" /><br/><sub>n8n</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/yaml/CB171E" width="32" alt="YAML" /><br/><sub>YAML</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/markdown/000000" width="32" alt="Markdown" /><br/><sub>Markdown</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/mermaid/FF3670" width="32" alt="Mermaid" /><br/><sub>Mermaid</sub></td>
    </tr>
    <tr>
      <td align="center"><strong>AI·실행·<br/>연동</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/Hermes-111827?style=flat-square&logoColor=white" height="32" alt="Hermes Agent" /><br/><sub>Hermes Agent</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Claw3D-6C5CE7?style=flat-square&logoColor=white" height="32" alt="Claw3D" /><br/><sub>Claw3D</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/docker/2496ED" width="32" alt="Docker" /><br/><sub>Docker</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Slack-4A154B?style=flat-square&logo=slack&logoColor=white" height="32" alt="Slack" /><br/><sub>Slack</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/WebSocket-111827?style=flat-square" height="32" alt="WebSocket" /><br/><sub>WebSocket</sub></td>
    </tr>
    <tr>
      <td align="center"><strong>브라우저·<br/>운영</strong></td>
      <td align="center"><img src="https://cdn.simpleicons.org/googlechrome/4285F4" width="32" alt="Chromium" /><br/><sub>Chromium</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Chrome%2FCDP-4285F4?style=flat-square&logo=googlechrome&logoColor=white" height="32" alt="Chrome CDP" /><br/><sub>Chrome/CDP</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/ubuntu/E95420" width="32" alt="Ubuntu" /><br/><sub>Ubuntu</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/python/3776AB" width="32" alt="Python" /><br/><sub>Python</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/git/F05032" width="32" alt="Git" /><br/><sub>Git</sub></td>
    </tr>
    <tr>
      <td align="center"><strong>보안확인<br/>대응</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/Stage%201-Byparr-7C3AED?style=flat-square" height="32" alt="Byparr" /><br/><sub>1차 Byparr</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Stage%202-Gemini%20Computer%20Use-4285F4?style=flat-square&logo=google&logoColor=white" height="32" alt="Gemini Computer Use" /><br/><sub>2차 Gemini Computer Use</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Stage%203-Hermes%20Browser-111827?style=flat-square" height="32" alt="Hermes Browser" /><br/><sub>3차 Hermes Browser</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Handoff-Watcher-0F766E?style=flat-square" height="32" alt="Handoff watcher" /><br/><sub>인계 감시기</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Alert-Slack-4A154B?style=flat-square&logo=slack&logoColor=white" height="32" alt="Slack stage alerts" /><br/><sub>단계별 Slack 알림</sub></td>
    </tr>
    <tr>
      <td align="center"><strong>업무<br/>연동</strong></td>
      <td align="center"><img src="https://cdn.simpleicons.org/curl/073551" width="32" alt="HTTP API" /><br/><sub>HTTP API</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Webhook-4285F4?style=flat-square" height="32" alt="Webhook" /><br/><sub>Webhook</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/External%20Connectors-Private-64748B?style=flat-square" height="32" alt="Private external connectors" /><br/><sub>외부 채널 커넥터</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/SMTP-64748B?style=flat-square" height="32" alt="SMTP" /><br/><sub>SMTP</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Approval%20Gate-16A34A?style=flat-square" height="32" alt="Approval gate" /><br/><sub>승인 게이트</sub></td>
    </tr>
    <tr>
      <td align="center"><strong>검증·<br/>복구</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/Regression%20Gate-0F766E?style=flat-square" height="32" alt="Regression gate" /><br/><sub>회귀 시험 게이트</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/terraform/844FBA" width="32" alt="Terraform" /><br/><sub>Terraform</sub></td>
      <td align="center"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E" width="32" alt="Node.js" /><br/><sub>Node.js</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/TOTP%202FA-334155?style=flat-square" height="32" alt="TOTP two-factor" /><br/><sub>TOTP 2단계 인증</sub></td>
      <td align="center"><img src="https://img.shields.io/badge/Public%20Data%20API-2563EB?style=flat-square" height="32" alt="Public data API" /><br/><sub>공공데이터 API</sub></td>
    </tr>
  </table>
</div>

<p align="center">
  <sub>업무 데이터는 DB 정본으로 관리하고, AI 판단·워크플로·브라우저 실행·사람의 승인을 명시적으로 분리한다.</sub>
</p>

### 기술 선택

<div align="center">
  <table>
    <tr>
      <td><strong>Reasoning</strong><br><sub>Hermes Agent · 역할별 판단과 인계</sub></td>
      <td><strong>Orchestration</strong><br><sub>n8n · 예약·polling·외부 연결</sub></td>
      <td><strong>State</strong><br><sub>PostgreSQL · 상태·감사·정합성</sub></td>
    </tr>
    <tr>
      <td><strong>Execution</strong><br><sub>Chromium · Chrome/CDP · 브라우저 경계</sub></td>
      <td><strong>Decision Gate</strong><br><sub>Slack Socket Mode · 승인·예외</sub></td>
      <td><strong>Operations</strong><br><sub>Claw3D · Kanban · WebSocket</sub></td>
    </tr>
  </table>
</div>

| 계층 | 기술 | 담당 영역 | 설계 포인트 |
|---|---|---|---|
| 업무 백엔드 | **Django 5.2 LTS** | 업무 API, 권한 경계, 상태 전이, 작업표 | 모듈형 단일 백엔드로 시작해 운영 복잡도를 낮춘다 |
| API | **Django REST framework** | 외부 연동·웹 UI·AI 도구용 업무 단위 API | 범용 SQL 대신 역할별 업무 도구만 노출한다 |
| 웹 프론트엔드 | **React + TypeScript + Vite** | 모니터링, 상품, 회계, 작업 상태 화면 | 타입 안전한 화면 계약과 빠른 개발 루프를 사용한다 |
| 정본 데이터베이스 | **PostgreSQL** | 주문·이행·배송·정산·감사 이력·작업 임대 | 유니크 제약, `CHECK`, 상태 전이, 중복 방지를 DB에서 강제한다 |
| 워크플로 오케스트레이션 | **n8n** | API polling, 예약, 연결, Slack·메일 알림 | 거래 상태의 정본이 아니라 트리거·연결 계층으로 제한한다 |
| AI 직원 런타임 | **Hermes Agent** | 역할 문서, 세션, 도구 호출, 인계, 승인 흐름 | 17개 프로필을 독립 실행 단위로 분리한다 |
| 직원 운영 화면 | **Claw3D + Kanban** | 직원 레지스트리, 세션, 작업 카드, 인계 상태 | WebSocket 기반 레지스트리와 작업공간을 연결한다 |
| 기본 브라우저 관측 | **Chrome/CDP + `ss-*` 도구** | 역할별 세션과 정형화된 화면 조회 | 보안확인 화면을 감지하면 코드 작업을 중단하고 기존 탭과 작업 상태를 인계한다 |
| 보안확인 1차 | **Byparr** | 격리 브라우저로 같은 공개 페이지의 구조화 데이터 확인 | 성공하면 현재 회차의 남은 페이지도 같은 백엔드로 읽는다 |
| 보안확인 2차 | **Gemini Computer Use** | 기존 탭의 시각 대응 | 1차 실패 뒤 화면에 보이는 단순 확인 요소만 처리하고 코드가 실제 페이지를 재검증한다 |
| 보안확인 3차 | **Hermes Browser** | 기존 탭의 두 번째 시각 대응 | 2차 실패 뒤 같은 검증 계약으로 마지막 복구를 시도한다 |
| 보안확인 전환·감시 | **Python watcher + systemd + 상태 기록** | 단계 전환, 읽기 전용 기존 탭 감시, 정확한 커서 재개 | 진행은 집계 알림에 갱신하고 실패·안전 중단처럼 사람이 볼 사건만 별도로 알린다 |
| 브라우저 기반 | **Chromium** | 직원별 로그인 세션과 로컬 headless 실행 | 브라우저별 세션·권한·작업 범위를 분리한다 |
| 메시징·결정 게이트 | **Slack Socket Mode** | 정상 진행, 예외, 중단, 사용자 결정 | 키·이메일 원문·결제정보를 메시지에 넣지 않는다 |
| 메일 계층 | **SMTP/자체 메일 연동** | 업무 결과 전달과 반송 수집 | 발송 결과를 외부 식별자와 함께 기록한다 |
| 운영 환경 | **Ubuntu, Docker, systemd, WebSocket** | 서비스 기동, 프로세스 관리, 실시간 연결 | 서비스별 책임과 재기동 경계를 분리한다 |
| 문서·구성 | **Markdown, YAML, Mermaid** | 역할 계약, 앱 매니페스트, 구성도 | 실행 가능한 설정과 설명 문서를 같은 구조로 관리한다 |
| 회귀 시험 게이트 | **Django test runner + `ss-selftest`** | 가격 계산·알림 분류·인계 상태·지난 사고 재현 시험(780여 개), 매일 실행 | 실패하면 업무 웹 배포가 막히고, 알림 문구 원본과 운영 워크플로가 다르면 실패한다 |
| 운영 감시·알림 | **systemd timer + JSON Lines outbox + Node.js 알림 렌더러** | 장기 대기·관측 중단·작업 정체 경고, 팀별·사건별 Slack 전달 | 같은 사건 알림은 담당 팀 채널의 한 스레드로 묶고, 인프라 채널에는 최종 실패만 올린다 |
| 웹 인증 | **TOTP 2단계 인증(PyOTP)** | 운영 웹 로그인 | 비밀번호 외 일회용 코드가 있어야 업무 웹에 들어간다 |
| AI 완료 검증 | **업무 도구 단계 검사 + 근거 대조** | AI 직원의 '완료' 보고를 상태 전이로 받기 전 확인 | 작업 시각·관측 기록·변경 기록 같은 근거가 없으면 도구가 거부한다 |
| 운영 문서 이력 | **Git(비공개 저장소)** | 운영 정본·결정 기록의 버전 관리 | 하루 두 번 동기화하고 사본이 30시간 넘게 뒤처지면 알린다 |
| 재해 복구 | **Terraform** | 서버 재구성 정의를 주기적으로 생성 | 복구 절차를 코드로 남겨 수동 재구성 의존을 줄인다 |
| 공공 데이터 연동 | **공공데이터포털·정책 공고 API(k-skill)** | 정부지원·정책자금 공고, 사업자 상태, 기준금리 조회 | 전략 담당 AI는 읽기만 하고, 신청·계약은 사람이 한다 |

## 핵심 설계 원칙

<div align="center">
  <img src="https://img.shields.io/badge/01-State%20First-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="State first" />
  <img src="https://img.shields.io/badge/02-Scoped%20Tools-6C5CE7?style=for-the-badge" alt="Scoped tools" />
  <img src="https://img.shields.io/badge/03-Execution%20Boundary-0F766E?style=for-the-badge" alt="Execution boundary" />
  <img src="https://img.shields.io/badge/04-Reconcile%20Failures-B45309?style=for-the-badge" alt="Reconcile failures" />
</div>

<div align="center">
  <sub>상태를 먼저 기록하고, 도구를 좁게 노출하며, 실행과 판단을 분리하고, 실패를 재조정한다.</sub>
</div>

### 1. AI 판단과 거래 정본의 분리

AI 직원은 판단·해석·인계·예외 설명을 담당한다. 주문 상태, 금액, 외부 식별자, 작업 임대,
정산 결과는 PostgreSQL에 저장한다. 대화 이력이나 Kanban 카드만으로 완료·결제·발송을 확정하지 않는다.

### 2. 업무 단위 도구만 AI에 노출

AI 직원에게 범용 SQL이나 무제한 셸 권한을 주지 않고, 다음과 같은 업무 단위 경계를 사용한다.

- 주문 조회와 상태 확인
- 상품·가격 관측 기록
- 작업 큐 생성과 인계
- 주문 이행 준비·확정·결과 대조
- 배송·회계·감사 기록 연결
- Slack 보고와 사용자 결정 요청

### 3. 브라우저 실행과 run 판단의 분리

브라우저 worker는 화면을 읽고 정해진 행동을 수행한다. Hermes 직원은 실행 결과를 해석해 계속 진행할지,
중단할지, 예외로 전환할지 판단한다. 두 계층을 분리해 화면 자동화 변경이 업무 정책 전체를 바꾸지 않도록 한다.

### Cloudflare Turnstile 대응 구성

정상 관측 중 Cloudflare Turnstile 보안확인이 감지되면 현재 요청을 중단하고 기존 브라우저 세션,
열린 탭, 정확한 작업 위치를 보존한다. 접근 계층은 같은 페이지의 필수 데이터를 아래 순서로 복구한다.

```mermaid
flowchart TD
    RUN[일반 브라우저 관측] --> DETECT{Turnstile 감지?}
    DETECT -->|아니요| DATA[공통 결과 계약으로 기록]
    DETECT -->|예| PAUSE[현재 요청 중단<br/>열린 탭과 정확한 작업 위치 보존]

    PAUSE --> B[1차 Byparr<br/>격리 브라우저에서 같은 공개 URL 읽기]
    B -->|필수 데이터 확인| ROUND[현재 회차의 남은 페이지도 같은 백엔드로 처리]
    B -->|확인 실패| G[2차 Gemini Computer Use<br/>기존 화면 시각 복구]
    G -->|확인 실패| H[3차 Hermes Browser<br/>기존 화면 시각 복구]
    G -->|통과 후 재검증| DATA
    H -->|통과 후 재검증| DATA
    H -->|실패| STOP[안전 중단<br/>커서 저장·다음 회차 재개]

    PAUSE -. 읽기 전용 감시 .-> RECOVER{기존 탭이 스스로 회복?}
    RECOVER -->|예| RETURN[현재 항목을 중복 요청하지 않고<br/>다음 페이지 경계에서 복귀]
    RETURN --> DATA
    ROUND --> DATA
```

| 단계 | 실행 경계 | 성공·전환 기준 |
|---|---|---|
| **1차 Byparr** | 기존 탭과 분리된 격리 브라우저 | 같은 URL에서 필수 데이터를 검증한다. 성공하면 남은 회차도 이 경로로 읽는다 |
| **2차 Gemini** | 기존 브라우저 탭 | 1차 실패 뒤 보이는 단순 확인 요소만 처리한다. 성공 문구 뒤 코드가 페이지 데이터를 다시 검증한다 |
| **3차 Hermes** | 기존 브라우저 탭 | 2차 실패 뒤 같은 제약과 결과 계약으로 마지막 복구를 시도한다 |

세 단계는 같은 결과 계약을 사용한다. 상품 페이지는 제목·가격·재고·지역 조건·에디션을,
목록 페이지는 정확한 쿼리와 상품 링크를 검증한다. 기존 탭 감시기는 화면을 읽기만 하며 이동·새로고침·
클릭·새 탭 생성을 하지 않는다. 반복 보안확인, 1차 백엔드 연속 차단, 계정 상태 이상은 안전 중단 조건으로
취급하고, 이미 모은 결과와 정확한 목록·상품 위치를 저장한다. 진행 단계는 집계 알림에 갱신하며 전체 실패·
안전 중단·계정 이상처럼 사람이 확인할 사건만 별도로 알린다.

공개 문서에는 외부 사이트·판매처 이름, 상품·계정 식별자, 접속 주소·포트, 세션 값, 상태 파일 경로,
인증정보와 실제 운영 기록을 포함하지 않는다.

### 4. 중복 실행과 부분 실패를 기본값으로 처리

외부 지출나 웹 화면 조작은 DB 트랜잭션과 동시에 확정할 수 없다. 따라서 다음을 기본 설계로 둔다.

- 외부 주문·결제·메일 식별자를 저장하고 재개 시 대조
- 작업 임대와 세대 번호로 동시 실행 차단
- `prepare / commit / reconcile` 단계 분리
- 확정 상태와 결과 불명 상태 분리
- DB 유니크 제약과 허용 상태 전이로 두 번째 확정 실행 차단
- outbox 사건으로 외부 알림을 재전달
- 마지막 성공 시각을 기록하고 서버 밖 감시로 중단을 탐지

## 전체 구성도

```text
                           사용자
                             |
                             v
                    +-------------------+
                    | Claw3D 3D Office  |
                    +---------+---------+
                              |
                              | WebSocket
                              v
                    +-------------------+
                    | Hermes Adapter    |
                    | 직원 레지스트리   |
                    +---------+---------+
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
   +---------------------+          +---------------------+
   | Hermes 프로필       |          | 직원 작업공간       |
   | profiles/ss-*       |          | workspace-ss-*      |
   | 표시 메타데이터     |          | 역할 문서와 규칙    |
   +---------------------+          +---------------------+
             |                                 |
             +----------------+----------------+
                              |
                              v
                    +-------------------+
                    | 업무 스킬 연결    |
                    | 민감 스킬은 비공개 |
                    +-------------------+
```

### 런타임 관계

1. Claw3D는 Hermes Adapter의 직원 레지스트리에서 직원 ID·표시명·역할을 조회한다.
2. Hermes 프로필은 직원별 런타임 식별자와 모델·세션 설정을 관리한다.
3. `workspace-ss-*`는 `IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `TOOLS.md`, `USER.md`를 제공한다.
4. 직원 문서는 역할·허용 범위·중단 조건·인계선을 선언한다.
5. 실제 민감 스킬은 서버 로컬에서만 연결하며 이 저장소에는 본문을 포함하지 않는다.

### 0.7.2 현재 가동 구성도

`project.md`의 0.7.2 기준 실제 가동 구조를 공개 범위에 맞게 요약하면 다음과 같다.
n8n은 정기 실행과 연결을 만들고, 업무 웹이 정본 DB와 직원 작업함을 연결한다.
브라우저 작업은 직원 전용 Chrome 세션과 `ss-*` 업무 도구로 분리한다. Skyvern은
철수·제거되어 현재 운영 경로에 없으며, 원본 웹훅 주소·인증정보·운영 경로는 공개하지 않는다.

```mermaid
flowchart TD
    NAPI[네이버 커머스 API] <--> WEB
    N8N[n8n 예약·연결·알림] -->|정기 업무 키| WEB[업무 웹 Django 창구]
    WEB <--> DB[(PostgreSQL 업무 DB)]
    WEB -->|작업함| EMP[Hermes AI 직원 17인]
    EMP -->|업무 단위 도구| TOOLS[ss-* 업무 도구]
    TOOLS --> CHROME[직원 전용 Chrome·CDP]
    CHROME --> EXT[승인된 외부 업무 화면]
    TOOLS --> OBS[비민감 관측 outbox]
    OBS -->|주기 수집| WEB
    WEB --> UI[업무 웹 화면·사용자]
    EMP <--> SLACK[Slack 팀 채널·DM]
    SLACK <--> USER[사용자 결정·인증 대기]
    WATCH[서비스·업무 감시] --> ALERT[n8n 알림 흐름] --> SLACK
    DB --> PACK[지휘본부 점검 자료]
    PACK --> HQ[COO·CTO·CFO·CSO]
    HQ --> AUDIT[오탐 판단·감사 기록]
    AUDIT --> WEB
```

### 0.7.3 상품·경쟁가 흐름과 오탐 감사

상품 정보 관측과 네이버 경쟁가 비교는 관측 outbox로 모은 뒤 공통 장부 판정과
자동 검증을 거친다. 플랫폼팀은 판정 결과를 확인해 상품 상태를 반영하고,
지휘본부는 검색 근거와 의심 사건을 별도 감사 자료로 대조한다. 공개 레이어에는
상품번호·판매자·가격 원문·검색 원본·내부 파일 경로를 포함하지 않는다.

```mermaid
flowchart LR
    CATALOG[상품 정보 관측 주기] --> OBS[(관측 outbox)]
    MARKET[네이버 경쟁가·신규 후보 비교] --> OBS
    OBS --> LEDGER[공통 장부 판정·마진 규칙]
    VERIFY[자동 검증·재검색 조건] --> OBS
    LEDGER --> PLATFORM[플랫폼팀 상품 상태 반영] --> STORE[스마트스토어]
    OBS --> EVIDENCE[지휘본부 감사 자료]
    EVIDENCE --> COO[COO 근거 대조]
    COO --> REVIEW[오탐·미탐 판단 기록]
    REVIEW --> AUDITS[업무 웹 품질 화면]
    USERREPORT[사용자 제보] --> OBS
```

## 업무 데이터 흐름

아래는 구현체와 교체 가능한 계층 계약을 설명하는 공개 논리 흐름이다.
현재 서버의 가동 경로와 실행기 구성은 위의 **0.7.2 현재 가동 구성도**가 우선한다.

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>01<br>Ingest</strong><br><sub>외부 API·n8n<br>조회·중복 제거</sub></td>
      <td align="center">→</td>
      <td align="center"><strong>02<br>Decide</strong><br><sub>Django·PostgreSQL<br>상태 전이·승인</sub></td>
      <td align="center">→</td>
      <td align="center"><strong>03<br>Execute</strong><br><sub>Hermes·Browser worker<br>prepare / commit</sub></td>
      <td align="center">→</td>
      <td align="center"><strong>04<br>Reconcile</strong><br><sub>outbox·감사 이력<br>결과 대조</sub></td>
    </tr>
  </table>
</div>

```mermaid
flowchart TD
    N[네이버 커머스 API]
    N8[n8n: 예약 트리거·Slack·메일·외부 연결] -->|주기 호출| API[Django 업무 API: 조회 위치·중복 제거·상태 전이]
    API <--> N
    API <--> DB[(PostgreSQL: 정본·작업표·정책·전이표·제약·하트비트)]
    API -->|사건| H[Hermes AI 사원 17역할: 판단·대응]
    H -->|업무 단위 도구만| API
    H -->|run 단위 판단| BR[브라우저 실행: 전역 임대 1개·주문 P0]
    BR --> SK[실행 workflow: prepare / commit / reconcile]
    SK --> BR --> API
    API -->|outbox 사건| N8
    N8 --> SL[Slack: 주문 채널·예외 채널·일일 요약]
    SL -->|사용자 결정| N8 --> API
    DB --> KB[Claw3D Kanban]
    DB --> UI[웹 화면]
    HC[서버 밖 감시] -.->|마지막 조회 성공 시각| API
```

### 계층별 책임

| 계층 | 책임 | 하지 않는 일 |
|---|---|---|
| 외부 커머스 API | 주문·상품·정산 정보 제공 | 내부 상태의 유일한 정본 역할 |
| n8n | 예약, polling, 연결, 알림, 사건 생성 | 결제 판단과 거래 상태 보관 |
| Django API | 업무 규칙, 상태 전이, 권한, 작업 임대, outbox | 브라우저 화면을 직접 해석 |
| PostgreSQL | 상태·금액·식별자·감사 이력의 정본 | AI 판단을 대신 수행 |
| Hermes | 역할별 판단, 결과 해석, 인계, 예외 보고 | 범용 DB 직접 조작 |
| Browser worker | 화면 관측과 브라우저 행동 | 전체 업무 정책 결정 |
| Slack | 진행상황, 예외, 사용자 결정 | 비밀값·원문 고객정보 저장 |
| Claw3D/Kanban | 운영 시각화와 작업 관리 | 거래 정본 저장 |

### 사건 알림 경로

운영 런타임·프록시·heartbeat·배치는 공통 기록기(`ss_alert.py`)를 호출해 사건을
JSON Lines outbox에 append한다. 별도 전송기(`ss_alert_watch.py`)는 cursor와 quiet
상태를 관리하면서 새 사건만 묶어 자동화 웹훅으로 보내고, 후속 워크플로가 팀 알림으로
전달한다. 웹훅 자격증명, workflow·credential DB, 실제 로그와 상태 파일은 공개 범위에서
제외한다. 공개 구현은 [`infra/alerts`](infra/alerts/)에 정리했다.

외부 사이트에서 확인 화면이 나타나면 코드 관측을 멈추고 열린 탭을 자동 감시기에 넘긴다.
감시기가 처리하면 중단된 관측을 같은 지점부터 재개하고, 처리하지 못하면 인프라 담당에게
알린다. 이 사건의 진행 알림은 담당 팀 채널에서 사건별 한 스레드로 묶는다.

<p align="center">
  <img src="docs/assets/n8n/ssAlertsToMason1.png" alt="통합 알림 라우팅 n8n 흐름" width="100%">
</p>

### n8n 워크플로 구성도

운영 중인 n8n 워크플로 16개(모두 활성)의 구성도다. `ss-n8n-snapshot`이 운영 n8n에서 워크플로를
내보내 노드 이름·종류·연결과 HTTP 대상 종류(업무 API·Slack API)만 남긴 뒤, 같은 서버의 n8n
미리보기 화면에서 다크 테마로 자동 캡처한다. 코드·URL 경로·헤더·채널 ID·자격증명·실행 데이터는
그림에 들어가지 않으며, 워크플로가 바뀌면 바뀐 것만 다시 그린다.

대부분의 예약 흐름은 같은 모양이다: **예약 트리거 → 업무 API에 작업 키 전달 → 결과 확인 → 실패 시
#ss-인프라팀 알림 → 알림 전달 확인.** 업무 판단은 업무 API 뒤의 AI 직원이 하고, n8n은 시각과 연결만
맡는다.

<table>
  <tr><td colspan="2"><strong>주문·영업</strong></td></tr>
  <tr>
    <td align="center"><strong>주문 조회</strong><br><sub>2분마다 → 주문 관제(Emma)</sub><br><br><img src="docs/assets/n8n/ssOrderPoll0001.png" alt="주문 조회 n8n 흐름" width="100%"></td>
    <td align="center"><strong>네이버 가격 비교</strong><br><sub>2시간마다 → Ava</sub><br><br><img src="docs/assets/n8n/ssSalesMkt001.png" alt="네이버 가격 비교 n8n 흐름" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><strong>새 상품 발굴 연쇄</strong><br><sub>5분마다 확인 → Noah</sub><br><br><img src="docs/assets/n8n/ssSalesDisc001.png" alt="새 상품 발굴 연쇄 n8n 흐름" width="100%"></td>
    <td align="center"><strong>신규 후보 비교</strong><br><sub>발굴 라운드 직후 → Ava</sub><br><br><img src="docs/assets/n8n/ssSalesNew0001.png" alt="신규 후보 비교 n8n 흐름" width="100%"></td>
  </tr>
  <tr><td colspan="2"><strong>플랫폼</strong></td></tr>
  <tr>
    <td align="center"><strong>플랫폼 장부 갱신</strong><br><sub>3시간마다 → Mia</sub><br><br><img src="docs/assets/n8n/ssPlatLedger01.png" alt="플랫폼 장부 갱신 n8n 흐름" width="100%"></td>
    <td align="center"><strong>등록 후보 바로 등록</strong><br><sub>5분마다 확인·순차 → Mia</sub><br><br><img src="docs/assets/n8n/ssPlatRegNow01.png" alt="등록 후보 바로 등록 n8n 흐름" width="100%"></td>
  </tr>
  <tr><td colspan="2"><strong>회계·지휘본부</strong></td></tr>
  <tr>
    <td align="center"><strong>회계팀 정기 업무</strong><br><sub>월초·월 마감·연간 신고 → Henry·Nora</sub><br><br><img src="docs/assets/n8n/ssAcctSchedule1.png" alt="회계팀 정기 업무 n8n 흐름" width="100%"></td>
    <td align="center"><strong>COO 일일 점검</strong><br><sub>매일 17:00 → Olivia</sub><br><br><img src="docs/assets/n8n/ssHqCooDaily001.png" alt="COO 일일 점검 n8n 흐름" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><strong>CTO 일일 점검</strong><br><sub>매일 17:00 → Ethan</sub><br><br><img src="docs/assets/n8n/ssHqCtoDaily001.png" alt="CTO 일일 점검 n8n 흐름" width="100%"></td>
    <td align="center"><strong>CFO 주간 조언</strong><br><sub>월 17:00 → Sophia</sub><br><br><img src="docs/assets/n8n/ssHqCfoWeekly01.png" alt="CFO 주간 조언 n8n 흐름" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><strong>CSO 주간 보고</strong><br><sub>월 17:00 → Daniel</sub><br><br><img src="docs/assets/n8n/ssHqCsoWeekly01.png" alt="CSO 주간 보고 n8n 흐름" width="100%"></td>
    <td></td>
  </tr>
  <tr><td colspan="2"><strong>인프라·알림</strong></td></tr>
  <tr>
    <td align="center"><strong>일일 백업·복원 점검</strong><br><sub>매일 05:00 → Liam</sub><br><br><img src="docs/assets/n8n/ssInfraBackupDaily01.png" alt="일일 백업·복원 점검 n8n 흐름" width="100%"></td>
    <td align="center"><strong>재해 복구 Terraform</strong><br><sub>3일마다 04:00 → Liam</sub><br><br><img src="docs/assets/n8n/ssInfraDr3d0001.png" alt="재해 복구 Terraform n8n 흐름" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><strong>통합 알림 라우팅</strong><br><sub>알림 수신 → 팀별 분기 → 응답 확인</sub><br><br><img src="docs/assets/n8n/ssAlertsToMason1.png" alt="통합 알림 라우팅 n8n 흐름" width="100%"></td>
    <td></td>
  </tr>
</table>

### 운영 웹 프런트엔드

장부형 업무 웹의 공개용 React·TypeScript·Vite 소스를 `frontend/`에 정리했다.
회계 장부, 가격 계산기·정책, 보낸 메일 화면과 상대 경로 API 계약을 포함하며,
운영 API·인증정보·원본 상품/주문/고객/금융 데이터·외부 판매 채널 식별자는 포함하지 않는다.
화면 예시는 실제 값과 날짜를 비식별화해 UI 구조만 보여준다.


### 주문·이행·메일 운영

최근 서버 변경에서 추가된 주문 관제, 이행 상태, 고객 전달, 메일 전달 상태의
공개 가능한 계약을 [`docs/operations/order-fulfillment-mail.md`](docs/operations/order-fulfillment-mail.md)에
정리했다. 유일 제약과 실행 임대, 중복 결제 방지, 암호화 키 보관·폐기, 가림 값,
관리자 권한 게이트, 메일 전달·수신확인 상태를 설명하되 외부 판매 채널 식별자와
계정·주문·고객 원문은 공개하지 않는다.

공개 프런트엔드의 `보낸 메일` 탭은 수신자·키를 가림 값으로만 표시하고, 전달 상태와
수신확인 시각을 운영자가 확인하는 화면 계약만 제공한다. 실제 메일 원문과 전달
자격증명은 서버 런타임에만 존재한다.

회계 장부의 기간별 요약, 자료 상태, 이행 인계·카드 대조, 예상 수익과 문서함 경계는
[`docs/operations/accounting-reconciliation.md`](docs/operations/accounting-reconciliation.md)에
정리했다. 실제 금융자료와 외부 채널 식별자는 운영 서버에만 남긴다.

2026-10-06 서버 업데이트에서 추가된 상품 변동·오탐 내역 화면은 읽기 전용 공개 계약으로
반영했다. 사원별 모델 라벨과 연결 스킬 이름은
[`docs/operations/employee-skill-catalog.md`](docs/operations/employee-skill-catalog.md)에,
백업·복원 시험 확인 규칙은
[`docs/skills/infrastructure/ss-backup-restore-check.md`](docs/skills/infrastructure/ss-backup-restore-check.md)에
정리했다. 상품 제외·사용자 대기·오탐/미탐·증거 품질 규칙은
[`docs/operations/ledger-quality.md`](docs/operations/ledger-quality.md)에 정리했다.
스킬 원문과 운영 자료는 공개하지 않는다.

2026-10-07~10-10 서버 변경은
[`docs/operations/current-server-updates-2026-10-10.md`](docs/operations/current-server-updates-2026-10-10.md)에
공개 가능한 운영 계약으로 요약했다. Chrome 기반 실행·인프라 복구·사용량/토큰 기록·
예외 중심 상품 관측·발굴 연쇄·상품별 비교 주기·가격/포트폴리오·주문별 회계 대조·
외부 반영 재확인 원칙을 다루며, 실행 원본과 민감정보는 포함하지 않는다.

### AI 모델·계정 구성

현재 가동 구성을 모델 제공자와 역할별로 나누면 다음과 같다. 계정 이름·이메일·잔여량·
인증 상태는 공개하지 않고, 계정 수와 역할 배정 구조만 공개한다.

```mermaid
flowchart LR
    HQ[지휘본부 4명<br/>COO · CTO · CFO · CSO] --> CP[GitHub Copilot<br/>GPT-6 Luna]
    CP -. 실패 시 .-> HQB[예외 대체 모델]
    OPS[실무·지원 13명<br/>플랫폼 · 영업 · 이행 · 회계 · 경리 · 인프라] --> G[agy<br/>Gemini 3.8 Flash High]
    G --> PLAN[컨텍스트 감시기<br/>주간·5시간 사용량으로 계정 자동 배정]
    PLAN --> POOL[계정 풀 4개]
    G -- 서버 혼잡 --> STEP1[다른 계정으로 순환]
    STEP1 -- 한 바퀴 모두 혼잡 --> STEP2[Flash Medium으로 낮춤]
    STEP2 -- 계속 실패 --> STEP3[비상 모델]
    STEP3 -- 계속 실패 --> STEP4[Copilot]
    POOL --> USAGE[10분 주기 사용량 확인<br/>한도 부족·소진·회복 알림]
```

- 전체 AI 논리 직원은 17명이며, 기본 모델 배정은 **Copilot 4명 + Gemini 13명**이다.
- Gemini 계정은 사원별로 고정하지 않는다. **컨텍스트 감시기**가 계정별 주간·5시간 사용량을 보고 배정하며,
  남은 사용량이 10% 이하인 계정은 예비로 돌린다.
- **사용량 한도(quota)와 서버 혼잡(503)을 구분**한다. 한도는 다른 계정으로 바로 넘기고, 혼잡은
  계정 순환 → 한 단계 낮은 모드 → 비상 모델 → Copilot 순서로 내려간다.
- 주문 이행은 멈추지 않는 것을 원칙으로 한다. 혼잡·한도로 실패하면 5분·15분·이후 30분마다 무제한
  다시 넣고, 감시기가 빠진 이행 작업을 스스로 다시 넣는다. 다시 실행은 처음부터가 아니라 기록된 단계부터 이어서 한다.
- 이행 담당의 백업 모델 순서는 **같은 모의 작업(최종 실행 직전 단계까지)을 모델별로 3번씩 시험**해 정확도와
  소요 시간(18분 상한)으로 정했다. 시험 중에는 도구가 최종 실행 클릭을 막는다.
- 백업 모델에는 Gemini용 업무 지침을 고치지 않고 **모델별 보충 지침**만 앞에 붙인다.
- `ss-agy-usage`가 계정별 사용량을 읽지만, 이 저장소에는 계정 식별자·이메일·토큰·실제 잔여량을 저장하지 않는다.
- Skyvern은 과거 보조 실행기였으나 철수·제거되었고, 현재 화면 실행은 Chrome/CDP와
  `ss-*` 도구만 사용한다.

## 17명 AI 직원 조직

직원은 프로필 ID, 표시명, 작업공간, 역할 문서로 구성된다. 표시명은 운영 화면에서 식별하기 쉽도록
`이름 (ss-역할)` 형식을 사용하며, 프로필 ID와 폴더명은 안정적인 내부 식별자로 유지한다.

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>지휘본부</strong><br><sub>검증·전략·품질</sub></td>
      <td align="center"><strong>플랫폼·영업</strong><br><sub>상품·시장·상품 정보 관측</sub></td>
      <td align="center"><strong>인프라</strong><br><sub>서비스·데이터·복구</sub></td>
      <td align="center"><strong>이행·배송</strong><br><sub>주문·실행·전달</sub></td>
      <td align="center"><strong>회계·경리</strong><br><sub>원장·정산·분류</sub></td>
    </tr>
  </table>
</div>

<p align="center">
  <img src="docs/assets/employee-network.svg" alt="17 AI employee organization map" width="100%">
</p>

| 팀 | 직원 | 프로필 | 작업공간 | 기술적 책임 |
|---|---|---|---|---|
| 지휘본부 | Olivia | `ss-coo` | `workspace-ss-coo` | 원본 증거와 장부의 교차 검증 |
| 지휘본부 | Ethan | `ss-cto` | `workspace-ss-cto` | 직원 상태·문서·연결 품질 점검 |
| 지휘본부 | Sophia | `ss-cfo` | `workspace-ss-cfo` | 가격·이벤트·성과 지표 조언 |
| 지휘본부 | Daniel | `ss-cso` | `workspace-ss-cso` | 자금·정책·중장기 전략 조언 |
| 플랫폼팀 | Mia | `ss-platform` | `workspace-ss-platform` | 상품·재고·상세·플랫폼 작업 |
| 영업팀 | Noah | `ss-sales-catalog` | `workspace-ss-sales-catalog` | 상품 정보 관측과 1차 검증 |
| 영업팀 | Ava | `ss-sales-market` | `workspace-ss-sales-market` | 경쟁가·예상 이익 2차 검증 |
| 인프라팀 | Mason | `ss-infra-ops` | `workspace-ss-infra-ops` | 승인된 배포·연동·서비스 상태 |
| 인프라팀 | Liam | `ss-infra-data` | `workspace-ss-infra-data` | 백업·복원·보존 상태 |
| 주문이행팀 | Emma | `ss-order-watch` | `workspace-ss-order-watch` | 주문 사건 관제와 작업 큐 |
| 주문이행팀 | Lucas | `ss-fulfill-monitor` | `workspace-ss-fulfill-monitor` | 계정 상태와 경고 모니터링 |
| 주문이행팀 | James | `ss-fulfill-main` | `workspace-ss-fulfill-main` | 주문 이행 주담당 |
| 주문이행팀 | Grace | `ss-fulfill-backup` | `workspace-ss-fulfill-backup` | 인계·복구와 활성 백업 |
| 주문이행팀 | Leo | `ss-delivery` | `workspace-ss-delivery` | 배송·직접전달 처리 |
| 회계팀 | Nora | `ss-accounting-web` | `workspace-ss-accounting-web` | 원장·원가·카드·조정 전표 |
| 회계팀 | Henry | `ss-accounting-naver` | `workspace-ss-accounting-naver` | 정산·세금계산서·입금 대조 |
| 경리팀 | Ella | `ss-bookkeeping` | `workspace-ss-bookkeeping` | 원본 분류와 승인 CSV 준비 |

### 직원 문서 계약

- `IDENTITY.md`: 표시명과 역할 식별
- `SOUL.md`: 판단 원칙과 금지 범위
- `AGENTS.md`: 실행 주기, 인계선, 승인, 중단 조건
- `TOOLS.md`: 허용 도구와 데이터 범위
- `USER.md`: 사용자 응답 형식과 보고 기준

지휘본부는 직접 실무를 실행하지 않고 검증·조언·인계를 담당한다. 이행·결제·고객정보·민감한
업무 데이터는 역할 문서만으로 권한이 생기지 않으며, 연결된 업무 도구와 별도 승인 경계를 거쳐야 한다.

## Slack 연동 모델

17명은 하나의 공용 앱이 아니라 직원별 Slack App Manifest를 사용한다. 각 매니페스트는 다음 계약을 가진다.

- Slack Socket Mode 기반 연결
- 직원별 앱 표시명·봇 표시명·프로필 ID
- 역할별 담당 채널과 DM 흐름
- Hermes gateway 명령 endpoint
- 토큰·사용자 ID는 저장소에 기록하지 않음

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>17 Apps</strong><br><sub>직원별 표시명·봇·권한</sub></td>
      <td align="center">→</td>
      <td align="center"><strong>Socket Mode</strong><br><sub>실시간 이벤트 전달</sub></td>
      <td align="center">→</td>
      <td align="center"><strong>Hermes Gateway</strong><br><sub>프로필·작업공간 연결</sub></td>
      <td align="center">→</td>
      <td align="center"><strong>Approval Gate</strong><br><sub>예외·확정·중단</sub></td>
    </tr>
  </table>
</div>

```text
Slack App Olivia (ss-최고운영)
        |
        v
Hermes profile ss-coo
        |
        v
workspace-ss-coo
```

매니페스트는 `slack_apps/ss-*/app-manifest.yaml`에, 17개 앱의 비밀값 없는 매핑은
`slack_apps/employee-integrations.yaml`에 저장한다. 실제 토큰 발급과 환경변수 등록은 운영 서버의
비공개 설정에서 수행한다.

## 저장소 파일 트리

<details>
<summary><strong>공개 저장소 구조 펼쳐보기</strong></summary>

```text
workspace-agent/
├── README.md
├── LICENSE
├── .gitignore
├── docs/
│   ├── assets/
│   │   ├── employee-network.svg
│   │   ├── n8n/                  # 워크플로 구성도(ss-n8n-snapshot 자동 생성, 다크 테마)
│   │   └── workspace-agent-hero.svg
│   ├── skills/
│   │   ├── accounting/       # 민감정보를 제거한 회계팀 공개 스킬 계약
│   │   └── infrastructure/
│   │       └── ss-backup-restore-check.md # 백업·복원 확인 계약
│   └── operations/
│       ├── employee-skill-catalog.md     # 사원별 모델·스킬 이름 카탈로그
│       ├── accounting-reconciliation.md  # 회계 요약·자료 상태·원가 대조 계약
│       ├── ledger-quality.md             # 상품 변동·오탐 품질 계약
│       ├── order-fulfillment-mail.md        # 주문·이행·메일 공개 운영 계약
│       └── current-server-updates-2026-10-10.md # 최신 서버 변경 공개 요약
├── frontend/
│   ├── src/                  # React 화면·상대 경로 API 계약·스타일
│   │   ├── Dashboard.tsx     # 비민감 통합 관제 화면
│   │   ├── Orders.tsx        # 가림 값 기반 주문 현황 화면
│   │   ├── Changes.tsx       # 상품 변동 읽기 전용 화면
│   │   ├── Audits.tsx        # 오탐 내역 읽기 전용 화면
│   │   ├── AcctSummary.tsx   # 기간별 회계 요약 화면
│   │   └── Mail.tsx          # 가림 값 기반 메일 전달 상태 화면
│   ├── package.json
│   └── README.md
├── infra/
│   └── alerts/
│       ├── bin/              # 사건 기록기와 자동화 웹훅 전송기
│       ├── producers/        # 런타임·프록시·heartbeat·배치 알림 지점
│       ├── systemd/          # 1분 주기 전송 서비스·타이머
│       └── README.md         # 공개 알림 계약과 운영 비공개 경계
├── slack_apps/
│   ├── employee-integrations.yaml
│   ├── ss-accounting-naver/app-manifest.yaml
│   ├── ss-accounting-web/app-manifest.yaml
│   ├── ss-bookkeeping/app-manifest.yaml
│   ├── ss-cfo/app-manifest.yaml
│   ├── ss-coo/app-manifest.yaml
│   ├── ss-cso/app-manifest.yaml
│   ├── ss-cto/app-manifest.yaml
│   ├── ss-delivery/app-manifest.yaml
│   ├── ss-infra-data/app-manifest.yaml
│   ├── ss-infra-ops/app-manifest.yaml
│   ├── ss-order-watch/app-manifest.yaml
│   ├── ss-platform/app-manifest.yaml
│   ├── ss-fulfill-backup/app-manifest.yaml
│   ├── ss-fulfill-main/app-manifest.yaml
│   ├── ss-fulfill-monitor/app-manifest.yaml
│   ├── ss-sales-market/app-manifest.yaml
│   └── ss-sales-catalog/app-manifest.yaml
├── profiles/
│   ├── ss-accounting-naver/profile.yaml
│   ├── ss-accounting-web/profile.yaml
│   ├── ss-bookkeeping/profile.yaml
│   ├── ss-cfo/profile.yaml
│   ├── ss-coo/profile.yaml
│   ├── ss-cso/profile.yaml
│   ├── ss-cto/profile.yaml
│   ├── ss-delivery/profile.yaml
│   ├── ss-infra-data/profile.yaml
│   ├── ss-infra-ops/profile.yaml
│   ├── ss-order-watch/profile.yaml
│   ├── ss-platform/profile.yaml
│   ├── ss-fulfill-backup/profile.yaml
│   ├── ss-fulfill-main/profile.yaml
│   ├── ss-fulfill-monitor/profile.yaml
│   ├── ss-sales-market/profile.yaml
│   └── ss-sales-catalog/profile.yaml
├── workspace-blog/
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── TOOLS.md
│   └── USER.md
├── workspace-infra/
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── TOOLS.md
│   └── USER.md
├── workspace-ss-accounting-naver/
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── TOOLS.md
│   └── USER.md
├── workspace-ss-accounting-web/
├── workspace-ss-bookkeeping/
├── workspace-ss-cfo/
├── workspace-ss-coo/
├── workspace-ss-cso/
├── workspace-ss-cto/
├── workspace-ss-delivery/
├── workspace-ss-infra-data/
├── workspace-ss-infra-ops/
├── workspace-ss-order-watch/
├── workspace-ss-platform/
├── workspace-ss-fulfill-backup/
│   └── skills/.gitkeep
├── workspace-ss-fulfill-main/
│   └── skills/.gitkeep
├── workspace-ss-fulfill-monitor/
│   └── skills/.gitkeep
├── workspace-ss-sales-market/
└── workspace-ss-sales-catalog/
```

</details>

각 Smartstore workspace의 표준 문서는 동일한 계약을 따르며, 주문이행팀 `skills/`는 영업비밀 보호를 위해
빈 폴더 표식만 저장한다. Git은 빈 폴더를 추적할 수 없으므로 `.gitkeep`을 사용한다.

## 기술적 포인트

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>Stateful</strong><br><sub>재시작·중복·부분 실패 복구</sub></td>
      <td align="center"><strong>Role-based</strong><br><sub>17개 역할과 명시적 권한 경계</sub></td>
      <td align="center"><strong>Replaceable</strong><br><sub>브라우저 실행기 교체 가능</sub></td>
      <td align="center"><strong>Auditable</strong><br><sub>상태 전이·outbox·감사 이력</sub></td>
    </tr>
  </table>
</div>

### 상태 중심 설계

스케줄러나 AI 대화가 중단되어도 마지막 성공 조회 지점, 외부 식별자, 작업 임대, 상태 전이를
DB에서 복구할 수 있다. 이는 단순 자동화 스크립트와 달리 재시작·중복·부분 실패를 설계 대상으로 삼은 부분이다.

### 권한 중심 AI 조직

17명의 AI 직원을 하나의 범용 에이전트로 만들지 않고 역할별 프로필·작업공간·문서·도구 범위로 분리했다.
문서 계약은 사람 조직의 직무기술서와 비슷한 역할을 하며, 실행 권한은 DB와 업무 API가 추가로 제한한다.

### 브라우저 자동화의 교체 가능성

주 브라우저 worker와 보조 엔진을 업무 코어에서 분리해 화면 변경이나 자동화 엔진 교체가
상태 모델·감사 이력·직원 역할을 다시 설계하는 일로 번지지 않도록 했다.

### 문서와 실행 설정의 분리

공개 저장소에는 재현 가능한 구조와 비민감 계약만 두고, 운영 서버에는 비공개 환경변수,
브라우저 세션, 인증 설정, 업무 스킬 본문을 둔다. 공개 가능한 설계와 운영 비밀을 분리하는
저장소 경계를 명확히 한 것이 이 프로젝트의 중요한 운영 설계다.

## 공개 범위와 보안 정책

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>공개</strong><br><sub>역할 문서 · 구조 · 계약 · 구성도<br>재현 가능한 공개 레이어</sub></td>
      <td align="center"><strong>비공개</strong><br><sub>인증정보 · 거래 데이터 · 세션<br>운영 런타임 · 주문 이행 자료</sub></td>
    </tr>
  </table>
</div>

저장소에 포함하지 않는 항목:

<table>
  <tr>
    <td>API key, access token, OAuth token, 비밀번호, private key</td>
    <td>Slack Bot/App Token과 사용자 ID</td>
  </tr>
  <tr>
    <td>브라우저 쿠키·세션·인증 파일</td>
    <td>PostgreSQL·SQLite·n8n 실행 데이터</td>
  </tr>
  <tr>
    <td>고객 이메일, 결제정보, 게임 키, 원본 장부</td>
    <td>외부 판매 채널별 계정·가격·주문 자료와 주문 이행 playbook</td>
  </tr>
  <tr>
    <td>주문이행팀의 <code>SKILL.md</code> 및 실제 스킬 구현</td>
    <td>로그, 캐시, 런타임 상태, 내부 비밀 설정</td>
  </tr>
</table>

`.gitignore`는 주문이행팀 스킬과 외부 판매 채널별 자료가 실수로 추가되지 않도록 경로명 기반 차단 규칙도 포함한다.
공개 저장소에 올리는 파일은 문서 allowlist와 staged diff 검사를 거친다.

## 검증 명령

<div align="center">
  <img src="https://img.shields.io/badge/Formatting-git%20diff%20--check-16A34A?style=flat-square" alt="Formatting check" />
  <img src="https://img.shields.io/badge/Secrets-Excluded-16A34A?style=flat-square" alt="Secrets excluded" />
  <img src="https://img.shields.io/badge/Skills-Public%20None-6C5CE7?style=flat-square" alt="No public skills" />
</div>

<details>
<summary><strong>공개 저장소 검증 명령 펼쳐보기</strong></summary>

```bash
git diff --check
git ls-files '*SKILL.md'
git ls-files '*skills/*'
git ls-files | grep -Ei 'credentials|secrets|token|private' || true
find . -type f \( -name '.env' -o -name '*.sqlite3' -o -name '*.lock' \) -print
```

</details>

정상 공개 상태에서는 실제 `SKILL.md`, 인증파일, 데이터베이스, 외부 판매 채널별 파일이 출력되지 않아야 한다.

## 현재 상태

- Smartstore AI 직원 17명 프로필·작업공간 문서화 완료
- Claw3D 직원 레지스트리와 Hermes 작업공간 연결 구조 반영
- 직원별 Slack App Manifest와 Socket Mode 연동 계약 정리
- Django·React·PostgreSQL·n8n·Hermes·Claw3D·브라우저 worker를 포함한 목표 아키텍처 문서화
- 상품 장부·회계 장부·계산기·정책·보낸 메일 공개 프런트엔드와 빌드 결과 반영
- 주문 관제·이행 상태·고객 전달·메일 전달 상태의 공개 운영 계약 반영
- 통합 관제·주문 현황·기간별 회계 요약·AI 사원·작업 로직의 공개 UI 계약 반영
- 상품 변동·오탐 내역의 읽기 전용 공개 UI 계약 반영
- 사원별 연결 스킬 카탈로그와 백업·복원 확인 스킬의 비민감 계약 반영
- 이행 인계·카드 대조·문서함·예상 수익의 회계 운영 계약 반영
- 최신 서버의 Chrome 실행·복구·사용량·관측·발굴·가격·포트폴리오 운영 변경 요약 반영
- 회귀 시험 게이트(220여 개)·알림 문구 원본과 운영 워크플로 일치 검사 반영(2026-10-17)
- 장기 대기·관측 중단 경고와 사건별 Slack 스레드 알림 반영(2026-10-17)
- 전략 담당 AI의 정부지원·정책자금 공고·공공데이터 주간 수집 반영(2026-10-17)
- 외부 사이트 확인 화면의 자동 감시·재개·실패 알림 흐름 반영(2026-10-17)
- 외부 사이트 식별 정보와 Slack 채널 ID·워크스페이스 주소를 공개 범위에서 제외(2026-10-17)
- 회귀 시험 게이트 780여 개로 확대 — 시험을 통과해야만 업무 웹 배포(2026-11-14)
- **AI는 판단, 금액 계산은 코드**: AI 직원은 순이익·환산을 직접 계산하지 않고 공통 계산 도구 결과만 쓴다. 판정 작업에서 AI는 판정만 답하고 기록은 코드가 계산해 쓴다(2026-11)
- AI 직원의 '완료' 보고를 코드가 근거(작업 시각·관측·변경 기록)로 확인한 뒤에만 다음 단계로 넘김(2026-11)
- 서버 혼잡·사용량 한도를 구분한 단계별 모델 전환과 이행 작업 무중단 재시도·감시 재투입(2026-11-13)
- 이행 백업 모델을 모델별 모의 시험(각 3회, 최종 실행 직전까지)으로 선정, 모델별 보충 지침 분리(2026-11-13)
- 오탐 신고를 유형별 담당 AI 직원에게 자동 배정 — 경쟁가는 시장 비교, 상품 정보는 재관측 뒤 비교, 등록 내용은 플랫폼, 계산·규칙은 코드가 근거를 보여 주고 이견은 기술 담당(2026-11-14)
- 문제를 고칠 때마다 같은 문제의 재발을 알리는 감시 항목을 함께 추가하는 운영 원칙 정착
- 운영 정본·결정 기록 문서의 비공개 git 버전 관리와 지연 감시(2026-11-14)
- 공개 저장소 갱신은 금지어 검사(외부 사이트·계정·채널 ID·주소·비밀값)를 통과해야만 올리고, 빌드 산출물은 저장소에서 제외(2026-11-14)
- 주문이행팀 스킬과 외부 판매 채널별 영업비밀은 저장소에서 제외
- 저장소는 공개 구조와 비민감 운영 문서에 한정

## 라이선스

이 저장소의 원본 문서, 구성 파일, SVG 시각화 자산은 [Apache License 2.0](LICENSE)으로 공개한다.
외부 서비스·상표·라이브러리·의존성은 각 권리자의 라이선스와 이용약관을 따르며, 이 저장소의 라이선스가
그 권리를 대신 부여하지 않는다. 비공개 운영 데이터와 서버 로컬 스킬은 이 저장소의 배포 대상이 아니다.
