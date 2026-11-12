# 통합본의 로컬 점검 — 브랜치 정리 이후

이 문서는 통합 작업 전 PR #33 / fde7689 전용 인계보다 우선한다. 예전 인계의 “문서만 바뀐 후속 커밋” 검사로 통합본을 검사하면 정상적으로 차단된다. 그 검사를 지우는 대신 이 통합 기준을 사용한다.

## 원격과 작업 폴더

저장소 통합 Actions가 성공하고 원격에 main·work/codefleet-integration만 있는지 확인한다. 기존 폴더에서 원격 이름과 dirty 상태를 먼저 확인한다. 원격 삭제는 사용자 PC의 로컬 브랜치나 미푸시 작업을 삭제하지 않는다.

```powershell
$ErrorActionPreference = 'Stop'
git remote -v
git status --short
git fetch --prune origin
if ($LASTEXITCODE -ne 0) { throw 'fetch 실패' }
$Main = (& git rev-parse origin/main).Trim()
if ($LASTEXITCODE -ne 0) { throw 'main 확인 실패' }
$Candidate = (& git rev-parse origin/work/codefleet-integration).Trim()
if ($LASTEXITCODE -ne 0 -or $Candidate -ne $Main) {
    throw '두 브랜치의 기준선이 다릅니다. 실제 검증된 커밋을 먼저 확인하십시오.'
}
# 대화 보고 및 통합 Actions의 최종 검증 커밋과 Candidate를 대조한다.
$Worktree = Join-Path (Split-Path (Get-Location).Path -Parent) 'CodeFleet-integrated-check'
if (Test-Path -LiteralPath $Worktree) { throw '기존 폴더를 지우거나 재사용하지 않습니다.' }
git worktree add --detach $Worktree $Candidate
if ($LASTEXITCODE -ne 0) { throw '별도 검증 폴더 생성 실패' }
Set-Location $Worktree
```

정리 직후 두 브랜치는 같은 커밋을 가리킨다. 이후 개발로 작업 브랜치가 전진한 경우에는 위 비교를 무시하지 말고 새 검증 기준을 정한다. 원래 작업 폴더의 checkout과 dirty 파일은 변경하지 않는다.

## 환경·안전성 시험

Node 24.14.1 이상, 시험 도구에 고정된 공식 Codex CLI 0.167.1이 필요하다. 후자는 최신 버전 권장이 아니라 이 시험의 호환성 조건이다. 전역 설치를 자동 변경하지 않는다. Docker·WSL·추가 모델 API 키·런타임 npm install은 이 Local 점검에 필요하지 않다.

```powershell
$Node = (Get-Command node -CommandType Application -ErrorAction Stop).Source
$Version = & $Node -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [version]$Version -lt [version]'24.14.1') { throw 'Node 버전 불일치' }
& $Node --test test/codex-live-acceptance.test.mjs
$SafetyExit = $LASTEXITCODE
if ($SafetyExit -ne 0) { throw "안전성 시험 실패: $SafetyExit" }
```

기존 안전성 시험은 21개이며 실패·제외 없이 통과해야 한다. 이 결과는 실제 모델 호출의 성공이 아니다.

## 새 Fixture 준비와 무모델 사전 점검

사용자가 이미 인증한 공식 Codex의 실제 .exe 또는 공식 .js/.mjs 경로를 지정한다. .cmd/.ps1 shim, 임의 wrapper, 토큰 복사로 우회하지 않는다. 다음 경로 두 개는 실제 사용자 환경으로 바꾼다.

```powershell
$CodeFleet = (Get-Location).Path
$Codex = (Resolve-Path 'C:\REPLACE\official-codex.exe').Path
$Fixture = [IO.Path]::GetFullPath('C:\REPLACE\new-codefleet-integrated-r02')
$Script = Join-Path $CodeFleet 'scripts\codex-live-acceptance.mjs'
$Dirty = & git status --porcelain --untracked-files=all
if ($LASTEXITCODE -ne 0 -or $Dirty) { throw '체크아웃 변경을 보존하고 중단합니다.' }
$Digest = (Get-FileHash -LiteralPath $Script -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Digest -ne '60ebaba928fe266cf3b05c424ca2f9fd4778c704681c451c4334e95295c60cd1') { throw '수용 도구 파일 불일치' }
if (Test-Path -LiteralPath $Fixture) { throw '기존 시험 폴더를 재사용하지 않습니다.' }
$Prefix = $CodeFleet.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if ($Fixture.Equals($CodeFleet, [StringComparison]::OrdinalIgnoreCase) -or $Fixture.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Fixture는 체크아웃 밖에 있어야 합니다.'
}
& $Node $Script prepare --dir $Fixture
if ($LASTEXITCODE -ne 0) { throw 'prepare 실패. 부분 기록을 보존합니다.' }
& $Node $Script status --dir $Fixture
if ($LASTEXITCODE -ne 0) { throw 'status 실패' }
& $Node $Script preflight --dir $Fixture --codex $Codex
$PreflightExit = $LASTEXITCODE
if ($PreflightExit -ne 0) { throw "preflight 실패: $PreflightExit" }
```

정상 결과는 READY_FOR_EXPLICIT_OWNER_MODEL_APPROVAL, readyForLiveTurn=true, modelTurnsStarted=0, ownerGrantIssued=false이다. UNKNOWN 비용, USD 상한 미집행이라는 한계는 유지된다. 기존 개인 프로젝트 밖의 새 Fixture에만 파일과 임시 Git 기준을 만들며 원격에 푸시하지 않는다.

여기서 멈춘다. 실제 모델 1회 호출·비용 수용, 제안 파일 적용, 테스트 실행은 각각 필요한 별도 사용자 검토를 거친다. 상태가 불확실하면 기록을 삭제하거나 새 Fixture로 우회하지 않는다. 예전 README의 이후 단계 설명은 행동 순서 참고로만 사용하며, 예전 SHA/branch를 현재 기준으로 재사용하지 않는다.

## 결과 인계와 로컬 브랜치

보고할 항목은 정확한 CodeFleet HEAD, Node/Codex 버전, 안전성 시험 pass/fail/skip 및 종료 코드, prepare/status/preflight의 종료 코드·최종 상태다. 로그인 출력·토큰·원시 transcript·개인 머신 절대 경로는 제외한다.

로컬 브랜치는 `git branch -vv`와 `git worktree list`로 별도 확인한다. 원격에 없는 로컬 브랜치라도 미푸시 커밋 또는 사용 중인 worktree가 있을 수 있다. 일괄 `git branch -D`, `git reset --hard`, `git clean`은 실행하지 않는다. 원본 HEAD는 원격 archive 태그와 통합 이력으로 복구할 수 있다.
