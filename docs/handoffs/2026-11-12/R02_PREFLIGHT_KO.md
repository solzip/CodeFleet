# R02 — 고정 후보의 사용자 환경 사전 점검

이 절차는 **실제 모델 호출 전까지만** 진행한다. `run`, 승인 적용, 테스트 승인, 병합, 배포를 포함하지 않는다. 아래 명령은 이 대화에서 실행한 결과가 아니라 사용자 환경용 인계 절차다.

> 게시본 보완: 코드 기준은 그대로 유지한다. 이 인계 폴더만 추가된 후속 문서 커밋에서도 아래 코드 동일성 검사를 통과한 경우에만 실행할 수 있다. 새 문서 커밋의 CI와 기존 코드 커밋의 CI는 별도 기록이다.

## 고정 대상

- 저장소: `solzip/CodeFleet`
- PR: **#33**
- 커밋: `fde7689727b19751f865dd7743c2a138e61a8e68`
- 트리: `da8857164d53f3e13b62ecb219a781c36696deac`
- Node: 프로젝트 요구 버전 **24.14.1 이상**. 관측된 CI는 24.14.1이다.
- 이 수용 도구가 검사하는 Codex CLI: **0.167.1**. 다른 버전을 수동으로 통과시키지 않는다.
- 시험: 새로운 임시 Git 프로젝트의 `src/todo.mjs` 안 `normalizeTitle` 구현. 원래 테스트는 변경하지 않는다.
- 수락 수준: `LOCAL_ONLY` / `UNPROTECTED`. 실제 보호 격리·사용자 신원 인증·USD 상한 보장을 뜻하지 않는다.

## 환경과 파일을 먼저 확인

기존 작업 저장소의 dirty 파일을 지우거나 자동 stash/reset/checkout하지 않는다. 검토된 별도 체크아웃을 사용한다. 다음 세 값은 사용자 환경의 실제 절대 경로로 선택한다.

1. `$CodeFleet`: 고정 커밋의 깨끗한 별도 체크아웃.
2. `$Codex`: 이미 설치·인증된 신뢰 가능한 Codex의 네이티브 `.exe` 또는 공식 `.mjs`/`.js` 진입점. 임의의 wrapper나 이 절차가 만든 가짜 실행 파일을 사용하지 않는다. Windows `.cmd` shim을 shell 우회로 실행하지 않는다.
3. `$Fixture`: 중요한 프로젝트와 CodeFleet 체크아웃 밖에 둘 **아직 존재하지 않는 새 디렉터리**. 이미 예약·실행 기록이 있는 디렉터리를 지우거나 재사용하지 않는다.

PowerShell 예시:

```powershell
$ErrorActionPreference = 'Stop'
$CodeFleet = (Resolve-Path 'C:\REPLACE\CodeFleet-reviewed').Path
$Codex = (Resolve-Path 'C:\REPLACE\official-codex.exe').Path
$Fixture = [IO.Path]::GetFullPath('C:\REPLACE\new-codefleet-r02-fixture')
$Node = (Get-Command node -CommandType Application -ErrorAction Stop).Source

$CodeBase = 'fde7689727b19751f865dd7743c2a138e61a8e68'
$Head = & git -C $CodeFleet rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Git HEAD 확인 실패' }
& git -C $CodeFleet merge-base --is-ancestor $CodeBase HEAD
if ($LASTEXITCODE -ne 0) { throw '고정 코드 후보의 후속 커밋이 아닙니다.' }
$Changed = @(& git -C $CodeFleet diff --name-only $CodeBase HEAD)
if ($LASTEXITCODE -ne 0) { throw '코드 동일성 확인 실패' }
$Unexpected = @($Changed | Where-Object { $_ -notmatch '^docs/handoffs/2026-11-12/' })
if ($Unexpected.Count -ne 0) {
    throw '인계 문서 밖의 변경이 있습니다. 검토된 후보를 조용히 교체하지 않습니다.'
}
$Dirty = & git -C $CodeFleet status --porcelain --untracked-files=all
if ($LASTEXITCODE -ne 0 -or $Dirty) { throw '체크아웃이 깨끗하지 않습니다. 사용자 작업을 보존하고 중단합니다.' }
$Version = & $Node -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [version]$Version -lt [version]'24.14.1') {
    throw '프로젝트 요구 Node 버전을 충족하지 못했습니다.'
}
$Script = Join-Path $CodeFleet 'scripts\codex-live-acceptance.mjs'
$Sha = (Get-FileHash -LiteralPath $Script -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Sha -ne '60ebaba928fe266cf3b05c424ca2f9fd4778c704681c451c4334e95295c60cd1') {
    throw '검토한 수용 도구와 파일 내용이 다릅니다.'
}
if (Test-Path -LiteralPath $Fixture) { throw '기존 시험 디렉터리를 재사용하지 않습니다.' }
$Prefix = $CodeFleet.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if ($Fixture.Equals($CodeFleet, [StringComparison]::OrdinalIgnoreCase) -or
    $Fixture.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw '시험 디렉터리는 체크아웃 밖에 있어야 합니다.'
}

& $Node $Script prepare --dir $Fixture
if ($LASTEXITCODE -ne 0) { throw 'prepare 실패. 부분 생성물을 삭제·재사용하지 말고 원인을 확인하십시오.' }
& $Node $Script status --dir $Fixture
if ($LASTEXITCODE -ne 0) { throw 'status 실패. 중단합니다.' }
& $Node $Script preflight --dir $Fixture --codex $Codex
$PreflightExit = $LASTEXITCODE
if ($PreflightExit -ne 0) { throw "preflight 미통과: exit $PreflightExit. 모델 호출 없이 중단합니다." }
```

`prepare`는 새 시험 디렉터리에 파일과 임시 Git 기준 커밋을 만든다. 기존 프로젝트 변경 또는 원격 Git 쓰기는 하지 않는다. `preflight`는 고정 시험 환경과 CLI 버전, 공식 로그인 상태 명령의 종료 코드를 검사한다. 로그인 원문·토큰·전역 설정 파일을 복사하거나 보고하지 않는다. 사전 점검 성공은 비용 승인이나 실행 권한 부여가 아니다.

## 통과 및 중단 조건

정상 기대 결과는 `READY_FOR_EXPLICIT_OWNER_MODEL_APPROVAL`이며 `modelTurnsStarted: 0`, `ownerGrantIssued: false`, `costStatus: UNKNOWN`, `usdCostCapEnforced: false`를 유지한다. 사전 점검만 끝난 시점에는 `turn-intent.json`이 없어야 한다.

`BLOCKED_CODEX_LOGIN_UNAVAILABLE`이면 해당 사용자 환경에서 인증을 따로 확인한다. 이 대화나 GitHub에 인증 파일을 올리지 않는다. `BLOCKED_TURN_ALREADY_RESERVED`, 손상·불완전 기록, 변경된 기준선/테스트가 있으면 새 모델 실행 없이 수동 확인한다. 버전 검사를 삭제하거나 manifest를 고쳐 통과시키지 않는다.

**여기서 중단한다.** 이 문서는 모델 호출 허가가 아니다. 실제 호출 전에는 1회 제안, 자동 재시도 없음, 알 수 없는 구독 사용량과 금액 상한 미집행을 명확히 수용해야 한다. 모델 결과 후에도 파일 바이트 적용과 테스트 실행은 각각 별도 Owner 검토가 필요하다.

## 기록할 결과

검사한 CodeFleet 커밋, Node/Codex 버전, 각 명령의 종료 코드, 마지막 상태 코드만 기록한다. 로그인 출력, 토큰, 원시 모델 transcript, 비공개 머신 경로는 공유하지 않는다. 결과는 현재 고정 후보에만 적용한다.

## 알려진 보장 범위

위 해시 비교는 검토 파일 일치 확인이지 악의적인 같은 사용자 프로세스에 대한 보안 격리 인증이 아니다. 프로그램·설정·파일의 동시 교체, OS 격리, 사용자 신원 및 실제 과금 상한을 증명하지 않는다. 실제 모델 수용과 브라우저 앱 E2E는 아직 별도 작업이다.
