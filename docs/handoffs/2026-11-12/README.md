# CodeFleet R01 게시 기록과 R02 로컬 인계

> 통합 이후에는 [통합본 로컬 점검](CONSOLIDATED_LOCAL_TESTS_KO.md)을 사용한다. 아래는 원래 PR #33 후보의 역사적 인계다.

| 항목 | 값 |
| --- | --- |
| 작성일 | 2026-11-12 KST |
| 작업 유형 | 기존 대화 산출물의 저장소 보존 및 사용자 실행 절차 정리 |
| 대상 코드 커밋 | `fde7689727b19751f865dd7743c2a138e61a8e68` |
| 게시 브랜치 | `work/r01-live-acceptance-integrity-20261112` |
| PR | #33, Draft 유지; #32 또는 main 병합 없음 |
| 선행 문서 | 아래에 보존한 분기 검토 보고서와 기존 코드 게시 기록 |
| 신규 감사 번호 | 부여하지 않음. 기존 감사/실행 기록 통계를 바꾸지 않는 인계 자료 보존 |

## 저장한 자료와 기록 시점

- [분기 검토 보고서](REPORT_KO.md): 검토 당시의 판단과 한계를 보존했다. 그 안의 원격 쓰기·새 커밋 0은 **원검토 시점**을 뜻하며 이번 문서 게시까지 0이라는 뜻이 아니다.
- [파일별 대조표](BRANCH_FILE_MATRIX.md): 고정한 두 분기의 변경 경로 목록. 실제 merge 충돌 목록이 아니다.
- [후보·통합 기록](candidate-and-integration-record.json): 검토 당시 ref, 코드 해시, CI 및 후속 통합 항목. `effects`와 환경 상태는 과거 검토의 스냅샷이다.
- [코드 게시·CI 기록](publication-record.json): `fde7689` 코드 수정과 그 커밋의 CI 결과. 새 문서 커밋의 CI 결과로 재사용하지 않는다.
- [R02 사전 점검](R02_PREFLIGHT_KO.md): 사용자 환경용 실행 절차. 게시본에서는 이 폴더만 추가된 후속 커밋도 코드 동일성 검사를 거쳐 사용할 수 있도록 안내를 보완했다.

이 게시 범위는 인계 문서뿐이다. 실행 코드, 테스트, 패키지, 워크플로, 승인 정책을 바꾸지 않는다. 실제 모델 실행, 파일 적용, 테스트 승인, 배포 또는 병합을 허가하는 문서도 아니다. 새 문서 커밋의 정확한 해시와 CI 상태는 PR에서 별도로 확인한다.

## 지금 로컬에서 할 일: 사전 점검까지

Windows PowerShell을 기준으로 한다. 기존 개발 폴더의 staged/unstaged/untracked 작업을 지우거나 자동 stash/reset하지 않는다. 모든 명령은 사용자 본인의 터미널에서 실행한다. 아래 명령은 작성 안내이며 이 대화에서 사용자 PC에 실행한 결과가 아니다.

### A. 원격 문서를 받고 별도 작업 폴더 만들기

기존 `solzip/CodeFleet` 로컬 저장소 루트에서 실행한다. 먼저 `git remote -v`로 origin이 해당 저장소인지 확인한다. 다른 원격이면 자동 변경하지 않는다.

```powershell
$ErrorActionPreference = 'Stop'
$Branch = 'work/r01-live-acceptance-integrity-20261112'
$CodeBase = 'fde7689727b19751f865dd7743c2a138e61a8e68'
& git fetch --no-tags origin $Branch
if ($LASTEXITCODE -ne 0) { throw 'fetch 실패' }
$DocsHead = (& git rev-parse FETCH_HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw '문서 커밋 확인 실패' }
& git merge-base --is-ancestor $CodeBase $DocsHead
if ($LASTEXITCODE -ne 0) { throw '고정 코드 후보의 후속 커밋이 아닙니다.' }
$Delta = @(& git diff --name-only $CodeBase $DocsHead)
if ($LASTEXITCODE -ne 0) { throw '차이 확인 실패' }
if (@($Delta | Where-Object { $_ -notmatch '^docs/handoffs/2026-11-12/' }).Count -ne 0) {
    throw '문서 외 변경이 있습니다. 후보를 다시 검토해야 합니다.'
}
$Worktree = Join-Path (Split-Path (Get-Location).Path -Parent) 'CodeFleet-r02-reviewed'
if (Test-Path -LiteralPath $Worktree) { throw '기존 폴더를 재사용하거나 삭제하지 않습니다.' }
& git worktree add --detach $Worktree $DocsHead
if ($LASTEXITCODE -ne 0) { throw '별도 작업 폴더 생성 실패' }
Set-Location $Worktree
& git status --short
if ($LASTEXITCODE -ne 0) { throw '작업 폴더 상태 확인 실패' }
```

이 방식은 원래 개발 폴더의 checkout을 바꾸지 않는다. 새 작업 폴더는 문서와 동일한 코드를 함께 담지만, detach 상태의 검증용 폴더이지 main 병합본이 아니다. 보고받은 게시 해시와 `$DocsHead`가 다르면 새 변경을 확인하고 실행 여부를 판단한다.

### B. 런타임과 Codex 실행 경로 확인

Node는 `24.14.1` 이상이어야 한다. 기존 CI와 같은 버전으로 맞추려면 `24.14.1`을 사용한다. 런타임 의존성 설치나 `npm install`은 필요 없다. 이 Local 시험에는 Docker나 WSL도 필요 없다.

이 수용 도구의 Codex CLI 허용 버전은 **0.167.1**이다. 최신 버전 일반 권장이 아니라 이 후보에 고정된 호환성 조건이다. 다른 버전이면 검사를 지우거나 전역 설치를 무조건 낮추지 말고, 별도 검토된 설치를 준비한다.

```powershell
node --version
Get-Command codex -All | Select-Object CommandType, Source
```

`--codex`에는 신뢰할 수 있는 공식 설치의 네이티브 `.exe` 또는 공식 `.js`/`.mjs` 진입점의 실제 절대 경로를 준다. Windows의 `.cmd`/`.ps1` shim 경로를 그대로 넣거나 임의 wrapper로 우회하지 않는다. npm 전역 설치를 사용했다면 `npm.cmd root -g`로 설치 루트를 확인하고 그 아래 `@openai/codex/bin/codex.js`가 실제 있는지 확인할 수 있다. 다른 설치 방식이면 경로를 추측하지 않는다. 로그인 파일·토큰을 열거나 이 저장소에 복사하지 않는다.

### C. 로컬 안전성 회귀와 사전 점검

별도 작업 폴더에서 다음 오프라인 시험을 실행한다. 실제 모델 호출이 없는 시험이며 이것으로 R02가 완료되는 것은 아니다.

```powershell
node --test test/codex-live-acceptance.test.mjs
$SafetyExit = $LASTEXITCODE
if ($SafetyExit -ne 0) { throw "안전성 시험 실패: exit $SafetyExit" }
```

기대 결과는 기존 21개 안전성 시험의 통과이며, 실패·제외가 있으면 그대로 기록하고 실제 모델 호출로 넘어가지 않는다. 다음으로 [사전 점검 문서](R02_PREFLIGHT_KO.md)의 실제 경로 세 개를 정하고 `prepare → status → preflight`를 실행한다. 새 Fixture는 CodeFleet 및 중요한 개발 프로젝트 밖에 둔다. `prepare`는 그 새 폴더에만 테스트 파일과 임시 Git 커밋을 만들며 원격에 푸시하지 않는다. `preflight`는 모델 실행을 시작하지 않는다.

통과 기준:

```text
status: READY_FOR_EXPLICIT_OWNER_MODEL_APPROVAL
readyForLiveTurn: true
modelTurnsStarted: 0
ownerGrantIssued: false
costStatus: UNKNOWN
usdCostCapEnforced: false
```

**지금은 여기서 멈춘다.** 현재 요청은 문서의 커밋·푸시와 로컬 할 일 정리다. 과금 가능 모델 호출이나 실제 제안 내용의 파일·테스트 승인이 아직 주어진 것은 아니다.

## 이후 별도 승인 후 진행할 R02

사전 점검 결과를 확인하고 사용자가 한 번의 실제 모델 실행과 알 수 없는 구독 사용량을 수용한 다음에만 실행한다. 아래 코드 블록을 앞선 사전 점검과 한꺼번에 실행하지 않는다. `$Node`, `$Script`, `$Fixture`, `$Codex`는 같은 사전 점검에서 확정한 값이다.

```powershell
# 별도 모델 실행·비용 동의 후 사용자 본인이 한 번만 실행
& $Node $Script run --dir $Fixture --codex $Codex --allow-model-turn --acknowledge-unknown-cost
$RunExit = $LASTEXITCODE
# 종료 코드 0만으로 성공 처리하지 말고 JSON 상태도 확인
& $Node $Script status --dir $Fixture
$StatusExit = $LASTEXITCODE
```

모델은 `src/todo.mjs`의 `normalizeTitle` 구현안을 제안하며, 이 단계에서는 소스를 적용하거나 테스트를 실행하면 안 된다. 성공 관측 상태는 `CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW`다. 이는 Objective 완료가 아니다.

`HUMAN_RECONCILIATION_REQUIRED`, `UNCONFIRMED_TURN_NO_RECEIPT`, 비정상 종료, timeout, 예약 흔적만 남은 상태에서는 중단한다. `run`을 반복하거나 `turn-intent.json`을 지우거나 새 Fixture로 바꿔 우회하지 않는다. 같은 실행이 이미 비용을 썼을 수 있으므로 기록을 보존하고 수동 확인한다.

정상 제안이 확인되면 순서는 다음과 같다.

1. `node scripts/codex-live-acceptance.mjs review --dir FIXTURE`로 정확한 파일 검토 정보를 만든다. 이것은 검토 기록 생성이지 적용 승인이나 소스 변경이 아니다. 사용자가 대상이 `src/todo.mjs` 하나인지, 제안 내용이 목표와 맞는지, 원래 테스트를 건드리지 않는지 직접 확인한다.
2. 승인한 경우에만 별도 터미널에서 그 응답의 정확한 `ownerAction`을 확인해 실행한다. 파일 단계는 `objective local-files-accept`이며, 사용자가 직접 `--acknowledge-unisolated`를 추가한다. 모델에게 승인 실행을 맡기거나 출력 문자열을 `Invoke-Expression`으로 실행하지 않는다.
3. `status`를 다시 확인하고 `review`를 새로 호출한다. 이번에는 새 후보에 결합된 테스트 검토다. 고정 Node 테스트 명령, Fixture 경로, 제한시간을 확인한 뒤 별도로 승인한다. 테스트 단계는 `objective local-accept`다. 파일 승인과 테스트 승인은 서로 다른 검토이며 오래된 해시를 재사용하지 않는다.
4. `finalize --dir FIXTURE`를 실행한다. 통과 조건은 종료 코드 0과 아래 verdict, `continuation: COMPLETE_LOCAL`, `currentTreeComplete: true`, 비어 있는 `reasons`다. 실패하면 미완료로 남기고 자동 수정·재실행하지 않는다.

```text
CODEX_TURN_OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL
```

통과해도 `protectedVerified: false`, `ownerAuthentication: NOT_ESTABLISHED`, `hostLiveTrust: PROVIDER_REPORTED_ONLY`, `usdCostCapEnforced: false`의 한계는 남는다. 작은 감독형 Local 시험을 기존 Host 세션 전체 자율 실행, Todo+Calendar UI 완성, Protected 수용 또는 출시로 확대 해석하지 않는다.

## 전달할 결과

사전 점검 단계에서는 CodeFleet HEAD와 코드 기준, Node/Codex 버전, 안전성 시험 pass/fail/skip·종료 코드, prepare/status/preflight의 종료 코드와 최종 상태만 전달한다. 실제 실행 후에는 추가로 Run 상태, 별도 적용·테스트 결과, finalize verdict와 reasons, 관측된 테스트 수를 전달한다. 로그인 원문·자격 증명·전체 환경 변수·원시 모델 transcript·개인 머신 절대 경로는 공유하지 않는다. Fixture와 상태 파일은 로컬에 그대로 보존한다.

## 결론

코드 후보는 `fde7689`로 고정하고, 문서 게시만 추가한다. 로컬에서 먼저 안전성 회귀와 모델 호출 없는 사전 점검을 완료한다. 이후 실제 실행과 두 차례 Owner 검토는 별도 승인 대상이다.

## 다음 작업

사용자 환경 사전 점검 결과 확인 후 제한된 실제 Codex 수용 R02. #14 변경의 선별 통합은 원검토 보고서의 I01~I04로 유지한다.

## 미해소로 남긴 것

전체 R01 통합·보안 검토, 실제 모델 수용 R02, 사용자 신원 독립 인증, 과금 상한 집행, 플랫폼별 실제 Host 수용 및 제품 출시는 미완료다. 새 문서 커밋의 CI 결과도 별도 확인해야 한다.
