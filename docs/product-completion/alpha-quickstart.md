# CodeFleet 알파 실행 안내

상태: 개발 중인 알파 후보. 공개 사용 릴리스 전이다. 현재 LICENSE는 사용을 허용하지 않으므로, 권리자의 허가 또는 라이선스 전환이 이루어진 파일럿에서만 사용한다.

## 지원 범위

현재 실제 관측 환경은 Windows의 Node v24.14.1, Claude CLI 2.1.285, Linux 컨테이너를 실행하는 Docker 엔진이다. 첫 실행 대상은 **의존성 설치가 필요 없는 Node 프로젝트의 기존 실패 테스트를 고치는 작업**이다. 다른 OS는 CI로 확인하기 전 지원을 보증하지 않는다.

- 수정 파일은 `src/` 아래 명시한 JS/TS 일반 파일이다. 파일 생성·삭제·테스트 수정·symlink·submodule은 제외한다.
- 테스트는 `test/` 또는 `tests/` 아래 명시한 Node 테스트 파일이다. 기준선에서 실제 테스트가 실패해야 한다.
- Claude는 도구 없이 JSON 편집 제안만 반환한다. Harness가 scope·정확한 원문 일치·변경 크기를 검사한다.
- Docker 검증 컨테이너에는 네트워크·호스트 자격증명·쓰기 가능한 소스 마운트를 제공하지 않는다. 임시 디렉터리 쓰기만 허용한다.
- 결과는 로컬 검증 산출물 또는 지정 GitHub 저장소의 draft PR이다. 원본 작업 디렉터리 수정, 자동 병합, 배포는 없다.

## 준비

필수: Node 24.14 이상, Git, 인증된 Claude CLI, Linux 컨테이너 Docker. PR 전달 시 인증된 GitHub CLI와 대상 저장소 쓰기 권한이 추가로 필요하다.

검증 이미지 준비:

```sh
docker pull node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
node src/alpha/cli.mjs doctor
```

패키지 후보를 받았다면 빈 디렉터리에서 `npm install /path/to/codefleet-package.tgz`로 설치하고 `npx --no-install codefleet-alpha doctor`를 실행한다. 공개 릴리스 파일명과 배포 URL은 아직 확정되지 않았다. 설치는 OS 서비스나 백그라운드 데몬을 등록하지 않는다.

`doctor`는 실행 파일·Docker 이미지·Claude 로그인 여부를 확인하며 계정 신원이나 토큰을 출력하지 않는다. GitHub 권한은 PR 전달 시 확인한다. doctor 성공이 모델 서비스의 가용성이나 비용 한도를 보증하지 않는다.

## 작업 계약 예시

대상 저장소에는 `src/math.js`와 **기대 동작을 단언하지만 현재 실패하는** `test/math.test.js`가 이미 커밋돼 있어야 한다. 작업 시작 전에 변경 사항을 커밋한다.

```json
{
  "schemaVersion": 1,
  "goal": "Make subtract(a, b) return a - b, including negative results.",
  "files": ["src/math.js"],
  "context": ["src/math.js"],
  "tests": ["test/math.test.js"],
  "maxAttempts": 2,
  "timeoutSeconds": 300,
  "attemptBudgetUsd": 1,
  "delivery": { "mode": "local" }
}
```

`context`와 `tests`의 내용은 인증된 Claude 서비스로 전송된다. 비밀값이나 전송 권한이 없는 소스를 포함하지 않는다. 에이전트에 GitHub 토큰을 전달하지 않는다. 모델 비용은 공급자 보고값이며 독립적으로 검증한 청구 금액이 아니다. 시도당 공급자 예산과 최대 시도 횟수·총 실행 시간을 제한하지만 금액 초과 불가능을 보증하지 않는다.

```sh
node src/alpha/cli.mjs run task.json /path/to/repository
node src/alpha/cli.mjs status RUN_ID
node src/alpha/cli.mjs pause RUN_ID
node src/alpha/cli.mjs resume RUN_ID
node src/alpha/cli.mjs cancel RUN_ID
node src/alpha/cli.mjs export RUN_ID /path/to/new-output-directory
```

`run`은 해당 계약의 파일 범위·모델 호출·명시한 전달 행동을 위임한다. 반환된 run ID를 보관한다. 종료 코드 0은 명령 성공, run/resume의 2는 예외·대기 상태, 1은 입력·환경 오류다. `status`에는 단계, 원인, 시도 수, 비용 측정 가능 여부, 이벤트가 표시된다.

상태 기본 위치는 사용자 홈의 `.codefleet-alpha`이며 `--state /path/to/state`로 변경할 수 있다. 동일 상태 경로를 사용해야 pause/resume/status가 같은 실행을 찾는다. 상태에는 원문·변경·검증 로그가 있으므로 공개 업로드하지 않는다. export도 공유 전 내용 확인이 필요하다.

## PR 전달

계약의 delivery를 다음과 같이 바꾼다.

```json
{ "mode": "pull-request", "repository": "OWNER/REPOSITORY", "base": "main", "authorName": "PUBLIC_HANDLE", "authorEmail": "PUBLIC_EMAIL" }
```

로컬 기준 커밋과 원격 base가 같아야 한다. `codefleet/RUN_ID` 브랜치와 draft PR을 만들며 사람의 검토를 요청한다. 기존 브랜치를 덮어쓰지 않는다. 응답 유실 시 RECONCILING으로 남기고 `resume`에서 같은 브랜치·PR·파일 내용을 조회한다. 기준 브랜치가 바뀌면 새 기준에서 작업을 다시 시작한다.

## 예외 해결

| 상태·원인 | 다음 행동 |
| --- | --- |
| 기준선 테스트가 모두 성공 | 목표 동작을 검사하는 실패 테스트를 준비하고 새 계약으로 실행 |
| Docker 이미지 없음 | 위 digest 이미지 다운로드 후 재개 |
| 인증 실패 | Claude/GitHub CLI에서 로그인 확인 후 재개 |
| 범위 밖·모호한 편집 제안 | 원인 확인. 필요 시 새 계약으로 더 작은 작업 지정 |
| 동일 제안 반복·시도 소진 | 결과와 테스트 증거를 확인하고 목표·맥락을 개선한 새 계약 생성 |
| PAUSED | 원하면 같은 ID로 resume |
| RECONCILING | 원격 효과가 불명확함. status 확인 후 resume으로 조회·재조정 |
| CANCELLED | 새 실행 필요. 이미 반영된 외부 효과는 자동 삭제되지 않음 |

## 업데이트·제거·한계

패키지 제거는 해당 설치 디렉터리에서 `npm uninstall codefleet`로 수행한다. 상태·후보 임시 디렉터리는 자동 삭제하지 않으며, 보존이 필요 없는지 확인한 후 운영자가 제거한다. 업데이트 전 worker를 멈추고 상태 디렉터리를 백업한다. 향후 schema migration은 검증 전까지 지원하지 않는다.

설치 패키지의 실제 모델·Docker 작업, Windows 전체 검사, Linux 알파 검사·컨테이너 경계를 확인했다. 강제 종료 복구와 원격 응답 유실은 자동 테스트로, 실제 PR 생성·재조회는 전용 브랜치에서 확인했다. Linux의 실제 모델 인증부터 PR까지와 외부 사용자 파일럿은 아직 검증하지 않았다. 최신 범위는 [진행 현황](progress.md)을 따른다. 기존 `codefleet` CLI와 새 `codefleet-alpha`는 실행 모델이 다르며 상태를 상호 이관하지 않는다.
