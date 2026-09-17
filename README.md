# 🏢 Workspace Agent (Claw3D & Hermes AI Employee Ecosystem)

이 저장소는 **Claw3D 3D 가상 오피스** 및 **Hermes Agent**에서 활동하는 전문 AI 직원(사원)들의 역할 정의, 페르소나, 지침, 스킬셋 및 작업 환경 설정을 관리합니다.

---

## 👥 상주 AI 직원 (Workspaces)

### 1. ✍️ 블로그팀 클로이 (Chloe / `workspace-blog`)
- **역할**: 콘텐츠 & 블로그 운영 전문가 (Content & Blog Operations Specialist)
- **주요 임무**: 기술/교육 블로그 포스팅, 구글/네이버 SEO 최적화, 기사 리팩토링, 소셜 배포 및 마케팅 전략 수립
- **주요 파일**:
  - `SOUL.md`: 클로이 페르소나, 어조(Vibe), 분석 및 글쓰기 원칙
  - `AGENTS.md`: 콘텐츠 리서치, SEO 스킬 가이드 및 워크플로우 지침
  - `IDENTITY.md`: 기본 프로필 및 캐릭터 정보
  - `TOOLS.md`: 블로그 포스팅 및 리서치 도구 정의
  - `USER.md`: 대상 워크스페이스 및 프로젝트 컨텍스트

### 2. 👷 인프라팀 알렉스 (Alex / `workspace-infra`)
- **역할**: 인프라 & 스토리지 전문 엔지니어 (Infra & Storage Specialist)
- **주요 임무**: OCI ARM 서버 인프라 관제, 3일 주기 디스크 용량 자동 최적화, Hermes Native Cron 및 Slack `#infra-storge` 실시간 승인 라이프사이클 운영
- **주요 파일**:
  - `SOUL.md`: 알렉스 페르소나, 안전 운영 원칙 및 수치 중심 브리핑 스타일
  - `AGENTS.md`: 5대 인프라 스킬셋 연동 및 안전 명령어 실행 지침
  - `IDENTITY.md`: 기본 프로필 및 캐릭터 정보
  - `TOOLS.md`: 시스템 점검 및 OCI 관제 도구 정의
  - `USER.md`: 사용자 선호도 및 안전 승인 정책

---

## 📁 디렉터리 구조

```
workspace-agent/
├── README.md
├── .gitignore
├── workspace-blog/               # ✍️ 블로그팀 클로이 워크스페이스
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── TOOLS.md
│   └── USER.md
└── workspace-infra/              # 👷 인프라팀 알렉스 워크스페이스
    ├── AGENTS.md
    ├── IDENTITY.md
    ├── SOUL.md
    ├── TOOLS.md
    └── USER.md
```

---

## 🔄 동기화 가이드 (Sync Guide)

서버의 실제 런타임 경로(`~/.hermes/workspace*`)와 깃허브 저장소를 동기화하는 방법:

```bash
# 1. 서버 워크스페이스 최신 내용 복사
rsync -av --exclude='session' --exclude='*.sqlite3' --exclude='*.lock' --exclude='*.sock' /home/ubuntu/.hermes/workspace-blog /home/ubuntu/.hermes/workspace-infra /home/ubuntu/workspace-agent/

# 2. 커밋 및 깃허브 푸시
cd /home/ubuntu/workspace-agent
git add .
git commit -m "feat: sync AI employee workspaces"
git push origin main
```
