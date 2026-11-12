# R01 분기 대조 및 R02 검증 후보 선정

**기준일:** 2026년 11월 12일(KST)  
**대상:** `solzip/CodeFleet` PR #14 / #32 / #33  
**결론:** R02의 제한된 MCP·감독형 Local 수용 시험에는 **PR #33 `fde7689727b19751f865dd7743c2a138e61a8e68`**를 고정한다. 이것은 전체 분기 통합 또는 일반 출시 후보 승인이 아니다.

## 1. 이번에 수행한 작업

GitHub에서 각 PR의 현재 HEAD와 Draft/병합 상태를 확인하고, #14와 #33을 양방향으로 비교했다. 제품 CLI, Goal 결과 표시, Planning/Bootstrap 검색, Task/Workflow 보고, 설치 Skill, MCP 진입점, package 시험 등록을 중심으로 소스 범위를 대조했다. 기존 게시 산출물의 두 파일은 ZIP에서 직접 읽어 SHA-256 및 Git blob 해시를 다시 계산했고 게시 기록과 일치했다. 새 소스 변경, 원격 게시, 병합, 실제 모델 호출은 하지 않았다.

전체 파일을 독립 재검토한 보안 감사는 아니다. 62개 변경 경로의 목록은 확보했지만 모든 행의 전체 코드를 읽었다고 주장하지 않는다. 전체 저장소 체크아웃을 확보하지 못해 실제 merge/cherry-pick 충돌 시험이나 통합 실행도 수행하지 않았다.

## 2. 고정한 기준선

| 구분 | 커밋 | 역할 |
|---|---|---|
| PR #14 | `ec24da6b9606067d9d8c278e62e1ed9dad173e49` | 관리형 Goal 실행·복구 UX 확장 분기 |
| PR #32 | `7e304033c5e391da59c77ad75c9c6acbecbcba45` | 제품 통합 후보의 원래 기준선 |
| PR #33 | `fde7689727b19751f865dd7743c2a138e61a8e68` | #32 + 두 파일의 수용 시험 무결성 수정 |
| 공통 조상 | `e82f6876cc8af6913a54ee186bc7bae14959c35c` | #14와 #33 양방향 비교 기준 |

#14에는 #33에 없는 33개 커밋, #33에는 #14에 없는 27개 커밋이 있다. 공통 조상 이후 변경 경로는 각각 19개·50개이며, 양측 모두 수정한 경로는 7개다. **커밋 그래프상의 차이는 기능 누락의 수가 아니다.** 양측 변경 경로를 실제 충돌 7건이라고 부르지 않는다.

공유 경로는 README 두 개, `docs/INDEX.md`, `package.json`, `src/hosts/install.mjs`, `src/product/cli.mjs`, `test/codex-reviewed-workflow.test.mjs`다.

## 3. 기능별 판단

### 유지할 R02 경로

#33의 `scripts/codex-live-acceptance.mjs`는 고정된 임시 `normalizeTitle` 프로젝트에서 1회 모델 제안만 요청한다. MCP는 기존 Task/계약/DAG/Fileset 및 `taskReport`를 사용하고, 파일 적용과 테스트 승인은 MCP 외부의 Owner CLI로 분리한다. 따라서 이 시험의 선행 조건에 #14의 관리형 `run-codex-goal` 또는 전체 분기 병합을 추가하지 않는다.

선정은 시험 범위를 좁히는 결정이며 모든 실사용 위험이 해소됐다는 인증이 아니다. 별도 Codex 프로세스의 단회 시험은 기존 대화형 Host 세션의 연속 실행 수용을 대신하지 않는다. Local 결과는 Protected 결과가 아니다.

### #14에서 후속 통합할 변경

1. **Goal 수준 완료 반환(I01).** `codex-goal-result.mjs`는 위임 실행의 exit 0만으로 성공을 반환하지 않고, 현재 Goal/Workflow 해시와 독립 완료 관측이 맞지 않으면 exit 2로 돌려준다. 관리형 실행을 제품 기능으로 수용하기 전에 보존·통합해야 한다. 현재 R02의 MCP/`finalize` 경로와는 별도다.
2. **실패 상태의 구체적 Repair 안내(I02).** #14의 `report.mjs`는 실패 Attempt가 있는 `WAITING_HUMAN`을 일반 인계 대신 `REPAIR_REVIEW_REQUIRED`로 보고한다. #33의 일반 인계도 실행 권한을 주지 않으므로 이번 비교에서 권한 우회가 입증된 것은 아니다. 확대된 Repair UX 수용 전에 선별 통합한다.
3. **중단 후 Goal/Bootstrap 재발견(I03).** `codex-goals`와 `codex-bootstraps`의 읽기 전용 목록, 페이지 제한, 손상 기록 처리, 설치된 Skill 안내와 회귀시험을 통합한다. #33의 MCP 도구 안내와 단일 Goal 반복 처리 지침을 제거하지 않는다.
4. **시험·패키지·문서 합치기(I04).** #14의 설치된 Goal 복구 시험을 추가하되 #33에 있는 MCP·Live 안전성·패키지 Goal·Work Log·Todo+Calendar 시험 및 수용 도구 배포 항목을 보존한다. `package.json`을 #14 버전으로 통째로 바꾸면 이 후보의 시험·패키지 항목이 빠진다. 문서 수치도 파일 복사가 아니라 통합 후 재측정한다.

전체 62개 경로는 `BRANCH_FILE_MATRIX.md`에 있다. 위 네 묶음은 새 엔진 개발이 아니라 기존 변경의 선별 통합·회귀 검증이다.

## 4. CI 근거와 한계

- #14 `ec24da6`: Alpha 실행 `43150932740` completed/success를 재확인했다.
- #33 `fde7689`: Alpha 실행 `43152220039`, 모델 호출 없는 CLI 호환성 실행 `43152219940` 모두 completed/success를 재확인했다.
- #33의 Node 24.14.1 Windows/Linux 21개 안전성 시험 결과와 플랫폼별 기존 skip은 이전 게시 기록에 있다. 이번에는 동일 실행 상태를 확인했으며 새 CI를 실행하지 않았다.
- **두 분기가 각각 성공한 것은 통합본의 성공을 뜻하지 않는다.** #14+#33 통합 CI는 NOT_RUN이다.
- 현재 대화 실행 환경은 Node `v22.16.0`, Codex CLI 경로 없음이다. 사용자 PC의 설치·로그인 상태를 검사한 결과는 아니다. Git clone은 DNS 조회 실패로 종료되어 전체 저장소 시험도 실행하지 않았다.

## 5. 다음 실제 실행 경계

다음은 사용자의 인증된 Codex 환경에서 고정 커밋을 확인하고 새 임시 시험 디렉터리에 `prepare → status → preflight`를 실행하는 것이다. 현재 환경에서는 그 단계를 완료했다고 표시하지 않는다. 자세한 중단 조건은 `R02_PREFLIGHT_KO.md`에 있다.

실제 모델 호출은 정확한 범위와 알 수 없는 구독 사용량에 대한 별도 동의 후 1회만 수행한다. 파일 적용·테스트 승인은 제안 바이트와 검증 명령을 보고 별도로 결정한다. 이번 작업은 그 승인들을 만들지 않았다.

## 6. 상태

| 항목 | 판정 |
|---|---|
| 고정 ref 기준 분기 목록·핵심 경로 대조 | 완료, 위 검토 범위에 한정 |
| R02 한정 후보 선정 | #33 `fde7689` 고정 |
| #14 변경의 제품 통합 | 미실시; I01~I04로 구분 |
| 전체 보안/통합 검토 R01 | 부분 완료 |
| 실제 Codex 수용 R02 | NOT_RUN |
| 소스 수정·새 커밋·원격 쓰기·병합·모델 호출 | 모두 0 |

## 근거 위치

- PR #14/#33 메타데이터 및 양방향 compare API: JSON 기록의 `evidence_urls`.
- #14 소스: `src/product/codex-goal-result.mjs`, `codex-planning-status.mjs`, `codex-bootstrap-index.mjs`, `cli.mjs`, `report.mjs`, `src/hosts/install.mjs`, `package.json`.
- #33 소스: `src/hosts/codex-mcp.mjs`, `src/hosts/install.mjs`, `src/product/report.mjs`, `scripts/codex-live-acceptance.mjs`.
- 위 소스는 표에 적힌 정확한 커밋에 한정한다. 이후 브랜치가 움직이면 후보를 조용히 교체하지 말고 다시 검토한다.
