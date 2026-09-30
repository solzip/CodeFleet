# CodeFleet 알파 실행 안내

> **품질 범위: 독립 검토를 유지하는 제한된 알파.** 재현된 조기 종료·비용 기록·검증 복구 결함의 수정과 회귀 검증을 완료했다. 임의의 적대적 JS에 대한 무인 수락은 보증하지 않는다. [수정 근거](../runs/2026-09-30/alpha-quality-remediation.md)를 따른다.


상태: MIT 라이선스의 실험적 공개 알파. [릴리스 다운로드](https://github.com/solzip/CodeFleet/releases/tag/v0.2.0-alpha.4). 운영자 보조 Java 적용을 확인했으며 독립 외부 사용자 자가 온보딩과 운영 환경 적합성 검증은 아직 미완료다.

## 지원 범위

아래는 Node 실행 안내이며 alpha.4의 Java 확장은 이 문서 마지막 절에 별도로 설명한다.

현재 실제 관측 환경은 Windows의 Node v24.14.1, Claude CLI 2.1.285, Linux 컨테이너를 실행하는 Docker 엔진이다. 첫 실행 대상은 **의존성 설치가 필요 없는 Node 프로젝트의 기존 실패 테스트를 고치는 작업**이다. 다른 OS는 CI로 확인하기 전 지원을 보증하지 않는다.

- 수정 파일은 `src/` 아래 명시한 JS/TS 일반 파일이다. 파일 생성·삭제·테스트 수정·symlink·submodule은 제외한다.
- 테스트는 `test/` 또는 `tests/` 아래 명시한 Node 테스트 파일이다. 기준선에서 실제 테스트가 실패해야 한다.
- Claude는 도구 없이 JSON 편집 제안만 반환한다. Harness가 scope·정확한 원문 일치·변경 크기를 검사한다.
- Docker 검증 컨테이너에는 네트워크·호스트 자격증명·쓰기 가능한 소스 마운트를 제공하지 않는다. 임시 디렉터리 쓰기만 허용한다.
- 결과는 로컬 검증 산출물 또는 지정 GitHub 저장소의 draft PR이다. 원본 작업 디렉터리 수정, 자동 병합, 배포는 없다.

테스트 이름·구조가 기준선과 달라지거나 테스트 중 process.exit/reallyExit/abort 및 assert 함수 변경이 필요한 프로젝트는 지원하지 않는다. 이 검사만으로 코드 정확성을 보증하지 않으며 최종 변경은 독립적으로 검토한다. 이전 버전의 실행 증거를 이관하지 말고 새 상태 경로와 새 실행을 사용한다. Docker는 현재 유일한 검증 실행기이며 호스트 직접 실행 옵션은 없다.

## 준비

필수: Node 24.14 이상, Git, 인증된 Claude CLI, Linux 컨테이너 Docker. PR 전달 시 인증된 GitHub CLI와 대상 저장소 쓰기 권한이 추가로 필요하다.

검증 이미지 준비:

```sh
docker pull node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
node src/alpha/cli.mjs doctor
```

릴리스에서 `codefleet-0.2.0-alpha.4.tgz`와 `SHA256SUMS.txt`를 내려받아 SHA-256을 비교한다. 빈 디렉터리에서 `npm install /path/to/codefleet-0.2.0-alpha.4.tgz`로 설치하고 `npx --no-install codefleet-alpha doctor`를 실행한다. npm 레지스트리에는 게시하지 않는다. 아래 소스 실행 예시는 패키지 설치 시 `node src/alpha/cli.mjs`를 `npx --no-install codefleet-alpha`로 바꿔 사용한다. 설치는 OS 서비스나 백그라운드 데몬을 등록하지 않는다.

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

로컬 기준 커밋과 원격 base가 같아야 한다. `codefleet/RUN_ID` 브랜치와 draft PR을 만들며 사람의 검토를 요청한다. 기존 브랜치를 덮어쓰지 않는다. 응답 유실 시 RECONCILING으로 남기고 `resume`에서 같은 브랜치·PR·파일 내용을 조회한다. 기준 브랜치가 바뀌어도 기존 PR은 원래 검증 증거와 대조해 조회한다. 새로운 원격 쓰기는 기준이 달라지면 거부한다. 실행 예산이 소진됐거나 전달 중 취소한 작업의 resume은 별도의 제한 시간 안에서 읽기 전용 조회만 수행한다. 기존 효과를 확인하지 못하면 RECONCILING에 남는다.

## 예외 해결

| 상태·원인 | 다음 행동 |
| --- | --- |
| 기준선 테스트가 모두 성공 | 목표 동작을 검사하는 실패 테스트를 준비하고 새 계약으로 실행 |
| Docker 이미지 없음 | 위 digest 이미지 다운로드 후 재개 |
| 인증 실패 | Claude/GitHub CLI에서 로그인 확인 후 재개 |
| 범위 밖·모호한 편집 제안 | 원인 확인. 필요 시 새 계약으로 더 작은 작업 지정 |
| 동일 제안 반복·시도 소진 | 결과와 테스트 증거를 확인하고 목표·맥락을 개선한 새 계약 생성 |
| PAUSED | 원하면 같은 ID로 resume |
| RECONCILING | 원격 효과가 불명확함. status 후 resume으로 조회. 취소·예산 소진 시 새 쓰기 금지 |
| CANCELLED | 새 실행 필요. 이미 반영된 외부 효과는 자동 삭제되지 않음 |

## 업데이트·제거·한계

패키지 제거는 해당 설치 디렉터리에서 `npm uninstall codefleet`로 수행한다. 상태·후보 임시 디렉터리는 자동 삭제하지 않으며, 보존이 필요 없는지 확인한 후 운영자가 제거한다. 업데이트 전 worker를 멈추고 상태 디렉터리를 백업한다. 향후 schema migration은 검증 전까지 지원하지 않는다.

설치 패키지의 실제 모델·Docker 작업, Windows 전체 검사, Linux 알파 검사·컨테이너 경계를 확인했다. 강제 종료 복구와 원격 응답 유실은 자동 테스트로, 실제 PR 생성·재조회는 전용 브랜치에서 확인했다. Linux의 실제 모델 인증부터 PR까지와 외부 사용자 파일럿은 아직 검증하지 않았다. 최신 범위는 [진행 현황](progress.md)을 따른다. 기존 `codefleet` CLI와 새 `codefleet-alpha`는 실행 모델이 다르며 상태를 상호 이관하지 않는다.

## Java Gradle/Maven

alpha.4에 추가된 기능이다. 설치한 패키지에서는 아래 `node src/alpha/cli.mjs` 대신 `npx --no-install codefleet-alpha`를 사용한다. 호스트 JDK 없이도 검증할 수 있지만 Linux 컨테이너 Docker와 이미지 준비 시 인터넷이 필요하다. 첫 지원 조합은 JDK 21 + Gradle 9.4.1(래퍼 버전 일치 필수) 또는 Maven 3.9.9다. 임의 JDK·빌드 도구 버전, Android, Kotlin 소스 수정, 사설 의존성 인증, 통합 인프라 실행은 이 범위에 포함하지 않는다.

계약은 기존 필드를 유지하면서 다음 `verification`을 추가한다. Maven은 `kind`를 `java-maven`으로 바꾼다. 단일 모듈은 `module` 필드를 생략한다.

```json
"verification": {
  "kind": "java-gradle",
  "module": "services/example-service",
  "image": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
}
```

- `files`: 선택 모듈의 기존 `src/main/java/**/*.java` 파일.
- `tests`: 같은 모듈의 명시된 `src/test/java/**/*.java` 테스트 클래스 파일. 패키지와 경로가 일치해야 한다. 테스트 클래스 전체를 실행하며 wildcard나 임의 명령은 받지 않는다.
- `context`: 수정 파일과 필요한 맥락만 지정한다. 지정 테스트는 자동으로 모델 맥락에 포함된다. 빌드 설정·테스트 수정은 에이전트에게 허용하지 않는다.
- `timeoutSeconds`: 첫 실행은 600~1200초 권장. 이미지 준비 시간은 실행 예산과 별도로 최대 15분이다.

```sh
node src/alpha/cli.mjs prepare-java /path/to/contract.json /path/to/trusted-clean-repository
# 출력된 image 값을 저장소 밖 contract.json의 verification.image에 반영한다.
node src/alpha/cli.mjs doctor /path/to/contract.json
node src/alpha/cli.mjs run /path/to/contract.json /path/to/repository --state /path/to/java-state
```

이미지 준비는 깨끗한 기준 커밋의 **빌드 코드**를 네트워크가 있는 컨테이너에서 실행한다. 신뢰하는 프로젝트에만 사용한다. 호스트 자격증명·사용자 홈은 마운트하지 않으며 캐시와 빌드 도구만 최종 로컬 이미지에 남긴다. 이미지 준비용 임시 스냅샷과 Docker 빌드 캐시는 로컬에 남으며 외부에 게시하지 않는다. 이미지에는 프로젝트의 의존성 정보가 포함될 수 있다.

실제 후보 검증은 이미지 ID를 고정하고 네트워크를 차단한다. Gradle 9가 요구하는 쓰기 가능한 모듈 디렉터리를 tmpfs에 만들되 Java 소스·테스트 디렉터리와 빌드 설정은 읽기 전용으로 마운트한다. 매번 새 빌드 출력·캐시 사본을 사용한다. JUnit XML에서 모든 선언 클래스의 실행과 수정 전후 테스트 이름을 확인하며 제외·미실행·보고서 불일치·빌드 자체의 flaky rerun은 수락하지 않는다. Gradle은 `test` 태스크, Maven은 Surefire `test`를 검증하며 프로젝트 전체 `check`/`verify`나 Failsafe 종단 검증을 대신하지 않는다.

실행 예시용 Maven 프로젝트는 [examples/java-maven](../../examples/java-maven/pom.xml)에 있다. 해당 디렉터리를 별도 폴더로 복사해 **독립 Git 저장소**로 초기화·커밋하고 계약 파일은 저장소 밖에 복사한다. 샘플은 의도적으로 경계값 테스트가 실패한다. Windows 복제 시 `git -c core.autocrlf=false clone ...`로 LF 기준선을 유지한다. 원본 저장소의 하위 디렉터리만 지정하면 Git 루트로 정규화되므로 독립 저장소가 필요하다.

완료된 Java 실행을 모델 재호출 없이 다시 검증하려면 `node scripts/alpha-java-verifier-smoke.mjs STATE RUN_ID`를 사용한다. 새 스냅샷에서 실패 기준선→기존 AI 수정 결과의 통과와 소스·테스트 쓰기 차단을 확인한다. 선택 테스트 통과만으로 악성 JVM 코드의 모든 보고서 위조나 업무 요구사항 충족을 보증하지 않으며 독립 리뷰를 유지한다.
