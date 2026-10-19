# G2 — Capability 기반 Provider 계약 통합

- 작업 일시: 2026-10-19 (Asia/Seoul)
- 기준 커밋: `c61e9b829b62dd41336a7225bf3b9165136484db` 위의 미커밋 G1·G2 작업 트리
- 브랜치: `feature/alpha-g0-refresh`, 작업 공간: `.codefleet/worktrees/alpha-g0`
- 작업 유형: 분석·구현·검증·결정
- 선행 기록: [G1](alpha-g1-contract-preservation.md), [G0](alpha-baseline-refresh.md)
- 범위: G2만. 커밋·푸시·배포·실제 모델 호출·원격 PR 없음.

## 작업 전 확인과 판단

실제 디렉터리, branch, HEAD, status를 대조했다. G1의 미커밋 변경, 설계 패키지, 감사 문서와 로그를 보존했다. G1 contract/judge/Alpha 테스트 및 G1 기록의 해시는 작업 전후 동일하다. Controller는 G1의 판정 경계를 유지하며 Provider 결과 보관만 확장했다.

CLAUDE, 제품 아키텍처·진행 기록, G1 기록 및 구현 패키지를 먼저 대조했다. decision-debt 검사에 전달한 운영 문서 13개에서 후보 4개·제외 9개가 나왔다. G1·progress의 완료 기록을 정체로 본 후보, architecture의 금지 경계를 정체로 본 후보, CLAUDE의 ID 보존과 정정 규칙을 충돌로 본 후보를 원문과 실행 근거로 해소했다. 민감 맥락 휴리스틱 경고는 공개 전 검토 대상으로 남긴다. 외부 공개를 수행하지 않으며 새 로그에서 로컬 사용자 경로를 제거했다. 설계에 있다는 이유로 구현·검증 완료로 판정하지 않았다.

## 변경 전 구조와 이유

Alpha Provider는 Claude 실행 인자·프로세스 실행·JSON 해석을 한 파일에서 처리하고 proposal/cost만 반환했다. Controller는 제안을 적용하고 독립 Verifier의 증거로 Judge를 호출했다. Legacy `src/agent.ts`의 CLI 실행·stream 이벤트와 역할 코드는 도구 실행을 허용하는 별도 계약이므로 Alpha로 이관하지 않았다. Legacy 엔진은 그대로다.

새 경계는 Provider 출력과 프로세스 결과, 사용량, 스키마 검사를 분리해 기록한다. Provider 성공은 편집 **제안**일 뿐이며, `HARNESS_EXECUTED` 증거와 후보 무결성·테스트 동일성 검증을 대신하지 못한다.

## 실제 G2 수정 파일과 책임

| 파일 | 책임 |
| --- | --- |
| `src/providers/interface.mjs` | 공통 요청·결과·오류, V1 스키마 및 범위 검증 |
| `src/providers/claude.mjs` | 기존 Claude no-tool 인자·환경·비용 처리와 구조화 출력 정규화 |
| `src/providers/codex.mjs` | Codex JSONL 파서·정규화 및 실행 차단 |
| `src/providers/capabilities.mjs` | 설치 버전·도움말 조회와 Provider/OS capability 구분 |
| `src/providers/registry.mjs` | 작은 trusted-host Map, Balanced 필터·결정적 선택 |
| `src/alpha/provider.mjs` | 기존 진입점과 exports를 유지하는 Claude 호환 facade |
| `src/alpha/controller.mjs` | 정상·오류 Provider 결과 artifact 보관 및 오류 시 알려진 비용 보존 |
| `test/providers.test.mjs` | Fake Adapter·실제 로컬 process·Store/Controller 계약 테스트 15개 |
| `scripts/provider-probe.mjs` | 모델을 호출하지 않는 로컬 capability 진단 |
| `package.json` | 기존 Alpha 테스트에 Provider 테스트 추가 |
| `docs/product-completion/progress.md`, `docs/INDEX.md`, 두 README | 현재 결과 링크 및 문서 수 갱신 |
| 이 기록, G2 로그·source evidence JSON | 실행 근거와 한계 |

G1 변경 파일을 G2 신규 구현으로 세지 않는다. 정확한 소스 내용은 [SHA-256 기록](alpha-g2-source-evidence.json)으로 식별한다.

## 공통 계약과 Routing

- ProviderIdentity: id/version/platform/executable. 기존 호환 실행에서 조회하지 않은 version은 null이며 추정하지 않는다. 별도 probe에 관측 버전·시각·도움말 해시를 기록한다.
- ProviderCapabilities: 열 가지 capability 각각 status/advertised/evidence. 도움말 광고와 실제 집행은 다르다. OS filesystem/network/credential isolation은 별도 environment 필드다.
- ProviderExecutionRequest: V1 contract, 선언된 전체 context/test 텍스트, feedback, timeoutMs, cancelled. 기본 mode는 PROPOSAL_ONLY. 세션 재사용·다른 모드·추가 context를 거절한다.
- ProviderExecutionResult: proposal, raw stdout/stderr, execution, usage/cost, events, schemaValidation, error를 분리한다. PROPOSED는 검증 완료가 아니다. 비용과 payload의 권한은 PROVIDER_REPORTED_ONLY다.
- ProviderError: code와 전체 결과를 보존한다. timeout/취소/nonzero/출력 제한/JSON 오류/스키마 오류를 실패로 처리한다. 중단 원인이 불명확하면 INTERRUPTED로 남긴다.
- ProviderRegistry/ProviderSelection: trusted host 함수이며 모델·계약에서 로딩하는 플러그인이 아니다. 설치→필수 capability→호스트 권한→명시 선택→프로젝트 기본 Claude→id 정렬 순서다. 필수 세 capability는 빈 required 인자로 제거할 수 없다. 임의 품질 점수는 없다.

명시 선택이 부적격하면 오류로 끝나며 다른 Provider로 몰래 전환하지 않는다. 기본 후보가 부적격일 때만 실행 전 적격 후보를 선택할 수 있다. 실행 이후 Provider 전환은 종료 여부만으로 안전을 추정하지 않고 G2에서는 모두 차단한다. 세션 전달도 없다.

`proposeSelected`는 매번 새 probe를 수행한다. 현재 production probe는 capability를 SUPPORTED로 승격하지 않으므로 새 strict 경로는 실제 두 Provider 모두 실행을 거절한다. 테스트의 SUPPORTED는 Fake Provider fixture뿐이다.

**기존 Alpha 호환 경로는 별도로 유지한다.** `src/alpha/provider.mjs`는 기존 Claude no-tool 실행을 공통 결과로 감싸며 새 strict routing으로 교체하지 않았다. 이는 기존 실행을 보존하라는 요구에 따른 것으로, 새 capability 인증이나 OS 격리 보장을 의미하지 않는다. CLI Provider 선택·V1 필드·schemaVersion·DB migration을 추가하지 않았다. 향후 strict 경로 활성화에는 검증된 capability 근거가 필요하다.

## 로컬 Capability 관측과 보안 한계

최종 조회: Windows, Node v24.14.1, Claude Code **2.1.303**, Codex CLI **0.162.1**. 초기 조회의 Claude 2.1.299와 달라 최종 버전과 도움말을 다시 관측했다. version/help 명령만 실행했고 모델 호출은 하지 않았다.

| Capability | Claude 도움말 | Codex exec 도움말 | 실제 집행 판정 |
| --- | --- | --- | --- |
| non_interactive_execution | print | exec | 두 Provider UNVERIFIED |
| structured_output | json-schema | output-schema | 두 Provider UNVERIFIED |
| proposal_only | tools 제한 옵션 | no-tool 보장 확인 불가 | 두 Provider UNVERIFIED, Codex 실행 차단 |
| session_support | resume | resume | UNVERIFIED, Adapter 재사용 금지 |
| streaming_output | output-format | json | UNVERIFIED, 저장 출력 파서만 Fake 검증 |
| cancellation | probe로 광고 확인 안 됨 | 동일 | Live 미검증, 로컬 child 종료 테스트 통과 |
| usage_reporting | 비용 상한은 보고 보장이 아님 | 비용 보고 확인 불가 | Live 미검증, 알 수 없는 비용 null |
| approval_integration | permission-mode | exec help에서 확인 안 됨 | UNVERIFIED, 새 승인 우회 없음 |
| filesystem_restriction | probe로 확인 안 됨 | sandbox 옵션 | OS 집행 UNVERIFIED |
| network_restriction | probe로 확인 안 됨 | probe로 확인 안 됨 | OS 집행 UNVERIFIED |

Codex native executable을 명시해 조회했다. npm의 cmd/ps1 wrapper는 기존 Alpha process 정책상 실행할 수 없다. Codex JSONL의 agent_message와 turn.completed만 편집 제안으로 해석하며 도구 이벤트·모호한 복수 응답·실패·잘린 turn은 거절한다. 파서 지원은 실행 지원이 아니다. createCodexAdapter.execute는 직접 호출하거나 요청에 가짜 capability를 넣어도 BLOCKED이며 자식 프로세스를 띄우지 않는다.

Codex read-only sandbox는 도구 실행 자체를 금지하는 보장이 아니다. 로컬 help와 [공식 CLI 문서](https://developers.openai.com/codex/cli/reference), [보안 문서](https://developers.openai.com/codex/security)를 대조했다. 프롬프트 금지문을 보안 집행으로 취급하지 않는다.

Claude는 기존 tools 빈 목록, 빈 strict MCP 설정, slash commands/hooks/session persistence 제한, 제한된 환경 변수, 임시 cwd, 비용 상한을 그대로 유지한다. 호스트 파일시스템·네트워크의 OS sandbox를 새로 제공하지 않는다. 실제 설치 버전의 no-tool 집행·자식 트리 취소·청구 비용은 Live 미검증이다. 원본 출력은 로컬 artifact에 보관되므로 공개할 때 별도 민감정보 검토가 필요하다.

## 검증 명령과 결과

| 명령 | 종료 코드 | 실행 범위 |
| --- | --- | --- |
| `node --test test/providers.test.mjs` | 0 | 15/15, 제외 0 |
| `npm.cmd test` (문서 작성 중 재검증) | 1 | 378개 코드 테스트 통과 후 아직 저장 전인 증거 파일 5개 링크 누락으로 posttest 실패 |
| `npm.cmd test` | 0 | Legacy 324 + Alpha 39 + Provider 15 = 378, 제외 0, posttest 포함 |
| `node src/alpha/cli.mjs doctor` | 0 | 도구·인증·격리 검증기 5/5, 모델 호출 없음 |
| `node scripts/provider-probe.mjs claude` | 0 | version/help 조회, liveValidation NOT_RUN |
| `node scripts/provider-probe.mjs codex <native-executable>` | 0 | version/help 조회, executionBlocked |

전체 검증의 opt-in 환경: CODEFLEET_TEST_DOCKER=1, CODEFLEET_TEST_JAVA=(Get-Command java).Source, CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45. 이미 준비된 로컬 이미지를 사용했다. Node/Maven 격리 Verifier와 JDK JUnit 파서 4건을 포함해 G0의 별도 JDK 검증을 생략하지 않았다. Java 코드는 수정하지 않았다.

검증 범위: 정상 편집→Harness 완료→재실행 시 Provider 호출 없음, Provider 실패·취소·시간 초과·잘못된 출력·비용 불명, 권한·capability 부족, fallback 거절, Provider-only 증거 거절, SQLite v1 및 기존 artifact, Lease/fencing/recovery/reconciliation/Delivery 모의 API 회귀. 테스트·기대값을 삭제하거나 약화하지 않았다.

실행 로그: [전체 검증](codefleet-g2-full.log), [Adapter 검증](codefleet-g2-provider-tests.log), [Doctor](codefleet-g2-doctor.log), [Capability 조회](codefleet-g2-probes.json). 기존 인용 검사 경고 11개는 과거 8개와 G1 미커밋 위치 3개이며 검사기를 완화하지 않았다.

문서 작성 중 링크 실패는 [실패 로그](codefleet-g2-document-links-failed.log)에 보존했다. 증거 파일을 저장한 뒤 전체 게이트를 재실행했다. 코드 테스트 성공을 posttest 성공으로 대신하지 않았다.

## 완료 여부와 다음 조건

G2 공통 계약·Fake Adapter·Alpha/Legacy 회귀 Quality Gate는 완료했다. Live Provider 호환성은 **미완료**이며 실제 두 Provider 모두 새 capability 인증 완료로 표시하지 않는다. Codex 실행은 보안 capability 미확인으로 차단돼 있다. 기존 Claude 호환 실행과 strict 신규 Routing은 구분한다.

V1 계약, SQLite 스키마, CLI, G1 Judge, Lease·Recovery·Delivery를 보존했다. Gradle Docker 실실행, 타 OS, 실제 모델·청구·원격 전달은 이번에 재검증하지 않았다. 자동 failover와 세션 재사용은 제공하지 않는다.

G3는 사용자 후속 지시 후 순수 Intent/Contract 범위부터 착수 가능하다. 실 Provider를 사용하는 신규 Routing 활성화는 버전별 no-tool·OS 정책의 집행 증거 확보가 선행돼야 한다. Live smoke는 별도 승인 후에만 수행한다. 이번 작업에서 G3~G6, 커밋·푸시는 수행하지 않았다.
