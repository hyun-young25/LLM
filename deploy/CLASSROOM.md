# 학생 기록 학습실 배포와 운영

기존 QR의 GitHub Pages 기본 주소 `https://hyun-young25.github.io/LLM/`는 학생 로그인 `https://gpt-learning-classroom.onrender.com/#login`으로 자동 이동합니다. QR을 다시 만들 필요가 없습니다. 로그인·학습 기록·관리자 페이지는 같은 Vue 화면과 Node 서버를 한 주소에서 제공합니다. 학생 이름·학번·응답·비밀번호·데이터베이스를 GitHub에 커밋하지 마세요.

자동 이동은 해당 GitHub Pages의 기본 주소에만 적용합니다. 기존 `#admin`, `#login`, `#learn` 및 심화 단계 주소는 유지하며, 공개 체험은 `https://hyun-young25.github.io/LLM/#learn`에서 계속 사용할 수 있습니다. `https://hyun-young25.github.io/LLM/worksheet.html` 학습지도 그대로 열립니다. Render 학습실, 관리자 주소와 기록 API에는 자동 이동을 적용하지 않습니다.

## Render 무료 배포

저장소 루트의 `render.yaml`은 **무료 Node 웹 서비스와 30일 무료 Postgres**를 선언합니다. 유료 디스크·유료 인스턴스는 만들지 않습니다. 기존에 유료 자원을 배포한 적이 없는 이 프로젝트의 첫 생성용 구성입니다. 다른 이미 운영 중인 자원에 그대로 적용하지 마세요.

- 무료 서버는 15분 미사용 시 잠들고 다음 접속 때 약 1분의 시작 시간이 필요합니다. 서버 안의 SQLite 파일은 이때 없어지므로 **별도 Postgres**에 계정과 기록을 저장합니다.
- 무료 Postgres는 **생성 후 30일**에 만료되어 접근할 수 없습니다. 만료 전에 CSV 요약과 전체 기록 JSON을 내려받으세요. 전체 JSON에는 학생별 응답·서술·실험·이벤트가 들어가며 계정 비밀번호나 세션은 포함하지 않습니다.
- 무료 제공량 안에서 사용하는 구성입니다. 계정의 대역폭·빌드 사용량 한도와 초과 과금 설정은 Render에서 확인하세요. 사용량 제한을 우회하는 상시 깨우기 요청은 보내지 않습니다.

1. Render의 사용할 작업공간을 확인합니다. 같은 지역에 무료 웹 서비스와 무료 Postgres를 생성합니다. 이미 무료 Postgres가 있는 계정은 무료 인스턴스 한도를 먼저 확인합니다.
2. `DATABASE_URL`에는 Postgres의 **내부 연결 주소**를 비밀 환경변수로 설정합니다. Blueprint에서는 `fromDatabase.connectionString`으로 연결됩니다. 외부 IP 접근은 기본 차단합니다.
3. `ADMIN_PASSWORD`와 `CLASSROOM_JOIN_CODE`는 Render가 생성하는 비밀 환경변수입니다. 소스나 VITE 환경변수에 넣지 마세요.
4. 배포 주소의 `/#admin`에서 `instructor`와 관리자 비밀번호로 로그인합니다. 명단(학번,이름)을 등록합니다. 동일 명단은 기존 기록을 유지하며 다른 이름과 충돌하면 명단 전체를 취소합니다.
5. 학생은 수업용 주소에서 이름·학번·참여 코드와 본인이 정한 10자 이상의 비밀번호로 첫 등록합니다. 이후 이름·학번·비밀번호로 로그인합니다.
6. 데이터베이스의 실제 만료일을 `CLASSROOM_EXPIRES_AT`에 ISO 날짜로 설정하면 관리자 화면에 표시됩니다. 만료일을 추측하지 말고 생성된 자원의 정보를 확인합니다.
7. 기존 Pages의 수업용 학습실 링크는 `https://gpt-learning-classroom.onrender.com`을 기본으로 사용합니다. 주소를 변경하면 GitHub Actions 변수 `CLASSROOM_URL`에 새 HTTPS 배포 주소를 설정하고, `index.html`의 QR 자동 이동 대상도 함께 변경한 뒤 Pages 워크플로를 실행합니다.

### 생성된 학습실의 연결 상태

무료 웹 서비스 `gpt-learning-classroom`과 무료 Postgres `gpt-learning-records`의 연결을 완료했습니다. 2026년 9월 11일(한국 시간) 운영 주소에서 데이터베이스 상태 확인, 관리자 로그인·학생 목록 조회·로그아웃, 비로그인 관리자 접근 차단을 확인했습니다. 학생 명단을 등록한 뒤 수업에 사용하세요. 새 Blueprint로 중복 생성하지 마세요.

연결 설정을 다시 확인해야 할 때는 다음 항목을 사용합니다.

1. Render에서 `gpt-learning-records`의 **Connect → Internal Database URL**을 복사합니다.
2. `gpt-learning-classroom`의 **Environment**에서 `DATABASE_URL`에 해당 값을 추가하고, `CLASSROOM_ENABLED`를 `true`로 변경한 뒤 저장·재배포합니다. 연결 주소는 비밀번호를 포함하므로 저장소에 넣지 않습니다.
3. 배포가 끝나면 `/api/classroom/health`가 `enabled: true`를 반환하는지 확인합니다. 관리자 주소는 `https://gpt-learning-classroom.onrender.com/#admin`입니다. 아이디는 `instructor`, 비밀번호는 웹 서비스의 비밀 환경변수 `ADMIN_PASSWORD` 값입니다.

현재 데이터베이스의 만료 시각은 **2026-10-10T17:17:49Z (한국 시간 2026년 10월 11일 02:17)**입니다. 만료 전에 관리자 화면에서 기록을 내려받으세요.

`PUBLIC_ORIGIN`은 선택 사항입니다. 설정하면 배포 주소의 origin과 정확히 일치해야 합니다. 미설정 시 Render의 `RENDER_EXTERNAL_URL`을 사용합니다.

## 환경변수와 실행

- Node 24 이상. `npm ci`, `npm run build`, `npm start` 순서입니다.
- `CLASSROOM_ENABLED=true`: 기록 기능 활성화. 미설정 시 기존 공개 체험을 제공합니다.
- `DATABASE_URL`: 서버 전용 Postgres 연결 주소. 있으면 SQLite 대신 Postgres에 저장합니다.
- `CLASSROOM_DB_PATH`: 별도로 구성한 SQLite 운영/로컬 실행의 파일 경로. 기본 `data/classroom.sqlite`. 무료 Render 운영에서는 사용하지 않습니다.
- `CLASSROOM_STORAGE_NOTICE`: 관리자 화면의 보관 안내.
- `CLASSROOM_EXPIRES_AT`: 실제 데이터베이스 만료 시각(ISO 형식).
- `ADMIN_LOGIN`: 최초 관리자 아이디. 기본 `instructor`.
- `ADMIN_PASSWORD`: 최초 관리자 생성용 비밀번호, 10~128자. 기존 계정이 있으면 서버 재시작으로 덮어쓰지 않습니다.
- `CLASSROOM_JOIN_CODE`: 첫 참여 등록용 코드, 8자 이상.
- `NODE_ENV=production`: Secure/HttpOnly 세션 쿠키. 운영 주소는 HTTPS가 필요합니다.
- `HOST=0.0.0.0`: 호스팅 서버 외부 요청 허용.
- `VITE_CLASSROOM_URL`: 공개 체험 페이지에서 이동할 수업용 주소. 공개 URL만 허용하며 비밀 값을 넣지 않습니다.

## 기록과 해석

학습 상태는 서버에 자동 저장하며 다음 로그인 때 복원합니다. 문항 응답은 서버에서 정답을 재판정하고, 처음 고른 답과 이후 변경한 답을 별도 이벤트로 보존합니다. 문항은 형성평가용이므로 학습 화면과 공개 소스에 해설이 있습니다. 부정행위 방지 시험 시스템이나 대학 SSO 신원 인증은 아닙니다.

기록: 활동 이동, 예상 확인, 문맥 비교와 이유, 표본 추출 조건·횟수, 생성 토큰과 문맥, 3개 연결 실험 실행·이유, 문항별 응답 시도, 서술, 심화 단계 이동. 이벤트 시각은 서버 수신 시각입니다. 화면 체류시간을 학습시간이나 출석으로 간주하지 않습니다. 클릭 없이 화면만 본 것은 체험 완료로 기록하지 않습니다.

관리자는 전체 명단, 미참여/로그인만 함/학습 중/완료 상태, 6개 활동 진행, 8문항의 첫·최근 정답 수, 학생별 선택 답·시각·시도 횟수와 서술을 조회합니다. CSV는 전체 학생 요약입니다. 상세 응답과 전체 이벤트는 학생 상세에서 확인하거나 전체 기록 JSON으로 내려받습니다.

활동 처음부터를 눌러도 과거 응답 시도와 이벤트는 삭제되지 않습니다. 최신 활동 상태와 서술은 갱신됩니다. 정답 수는 누적 첫 응답·최근 응답 기준입니다. '6개 활동 완료'의 마지막 조건은 8문항에 답하는 것이며, 정답 수는 별도로 표시됩니다.

수신 실패 시 입력과 보내지 못한 기록을 현재 화면에 유지하고 재시도 버튼을 보여 줍니다. 저장 실패 상태에서는 창을 닫지 마세요. 브라우저 강제 종료·오프라인 종료 후 미전송 기록까지 복구하는 기능은 없습니다. 여러 창의 저장이 충돌하면 덮어쓰지 않고 최신 상태를 다시 불러오도록 안내합니다.

## 데이터 보관과 복구

세션은 12시간 후 만료하며 로그아웃 시 폐기됩니다. 로그인과 쓰기 요청에 빈도 제한을 적용하고, 모든 관리자 API에서 역할을 검사합니다. 관리자 비밀번호나 학습 기록은 브라우저 저장소에 보관하지 않습니다. 비밀번호는 salt가 있는 scrypt 해시로, 세션 토큰은 SHA-256 해시로 서버에 저장합니다.

무료 Postgres 만료 전에 관리자 화면에서 전체 기록을 내려받으세요. 이는 조회용 내보내기이며 계정·세션까지 재구축하는 데이터베이스 백업은 아닙니다. 별도로 SQLite를 운영한다면 영구 디스크 백업을 운영 계정에서 관리하세요. SQLite WAL 사용 중 파일 하나만 복사하지 말고 SQLite backup API 또는 서버를 정지한 일관된 백업을 사용하세요. 디스크 삭제·서비스 삭제 전에 보존할 기록을 내보내고 백업하세요.

비밀번호 분실 시 서버 운영자가 `RESET_LOGIN`과 `RESET_PASSWORD`를 비밀 환경변수로 제공하고 `node deploy/reset-password.mjs`를 한 번 실행할 수 있습니다. 해당 계정의 기존 세션을 모두 폐기합니다. 무료 Render 웹 서비스는 Shell/SSH가 없으므로 이 명령은 데이터베이스에 안전하게 연결된 별도 관리 환경에서 실행해야 합니다. 실행 후 두 변수를 제거하세요. 계정과 학습 기록은 유지됩니다.

## 검증

`npm test`: 기존 수학·생성 계산과 별도로 관리자 접근 차단, 학생별 기록 분리, 등록 명단 검사, CSRF 방어, 최초·최근 응답과 서버 채점, 중복 저장·동시 수정, 재시작 뒤 복구, CSV 수식 방어, 저장 실패 복구를 검증합니다. GitHub Actions는 별도의 PostgreSQL 17 테스트 데이터베이스에서도 동일한 API 시나리오를 실행합니다.

참고: [Render 무료 제공 범위](https://render.com/docs/free), [GitHub Pages의 정적 호스팅](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Render Blueprint](https://render.com/docs/blueprint-spec), [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html).
