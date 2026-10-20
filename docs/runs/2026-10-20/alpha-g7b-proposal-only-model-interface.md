# G7-B — 도구 없는 모델 인터페이스의 오프라인 구현

- 일시: 2026-10-20, Asia/Seoul
- 작업 유형: 설계 결정·구현·오프라인 검증
- 작업 공간: `.codefleet/worktrees/alpha-g0`, branch `feature/alpha-g0-refresh`
- 기준 커밋: `effb42b501c25865b19d955cea828cc5a7eb4b08`
- 선행 기록: [G7-A](../2026-10-19/alpha-g7a-live-provider-readiness.md), [G6](../2026-10-19/alpha-g6-product-integration.md), 기존 구현 패키지 EXECUTION_CONTRACTS/ACCEPTANCE_MATRIX, CLAUDE.md.
- REGISTER 번호 실측 최대값: P0-17, P1-61. 신규 결함 ID 부여·등급 변경 없음. 기존 REGISTER 동결 유지.
- 범위: C 경로의 최소 **오프라인** 통합. 실제 모델·키·로그인 조회·PR·커밋·푸시·배포 없음.

## 선택과 위협 모델

직접 모델 API의 JSON 요청/응답 프로토콜을 선택했다. OpenAI Responses와 Anthropic Messages의 구조화 출력 형식을 만들고 호스트에서 다시 검증한다. Codex CLI/앱 서버 또는 Claude Agent SDK의 agent loop를 실행하지 않는다. **OpenAI 직접 모델 API는 Codex CLI 구독 실행과 다른 경로**다. 이번에 Codex를 활성화했다는 뜻이 아니다.

공격 입력은 자연어·저장소 내용·모델 응답이다. 신뢰 경계는 기존 Coordinator, 코드에 고정된 요청 빌더, 제한된 HTTP 전송기다. 신뢰된 애플리케이션 코드 자체나 OS 관리자가 악성인 경우까지 막는 OS Sandbox는 아니다. 모델에게 로컬 함수·shell·filesystem·network 도구를 등록하지 않고, 응답은 데이터로만 파싱한다. 서버 도구도 tools 목록에 넣지 않는다.

기본 CLI에 API 키나 Fake Server URL 옵션을 추가하지 않았다. 새 경로는 기존 trusted registry/dependency 주입 지점에서 사용하는 `createOfflineModelAdapter`다. 제품 일반 사용자가 가짜 경로를 Live 우회로 선택할 수 없다. 실제 모델 endpoint에 연결하는 생성자/설정/환경변수 경로는 이번 구현에 없다.

decision-debt preflight는 사용자 선택 G7-A 기록 한 개, 최종 차단 0, 제외 1이었다. 제외 항목은 credential/환경 경계 설명의 민감 맥락 후보였으며 실제 비밀이 기록됐다는 판정이 아니다. 기록과 코드를 대조하고 허가된 오프라인 범위만 진행했다. 이 감사는 전체 문서의 최신성이나 Live 안전성 인증이 아니다.

## 공식 인터페이스 비교

2026-10-20에 공식 문서를 열어 확인했다. 문서상의 기능과 이번 로컬 검증을 구분한다.

| 인터페이스 | Tool dispatch / 우회 경계 | 출력·세션·취소 | 인증·과금 및 선택 |
| --- | --- | --- | --- |
| Codex App Server | command/file-change 승인 RPC와 dynamic tool 호출 존재. 승인 요청이 오는 경로만 거절하는 것으로 내부 모든 도구 차단을 증명할 수 없음 | JSON-RPC thread/turn, outputSchema, 이벤트, turn/interrupt. interrupt 응답만으로 원격 비용/부작용 종료 확정 불가 | CLI 계열 ChatGPT 또는 API 인증 선택 가능. 이번에는 실행/인증정보 조회 안 함. no-tool 인증 부재로 미채택 |
| Codex SDK | 로컬 Codex agent를 제어하는 상위 인터페이스. SDK 선택 자체가 host-owned deny-all 보장이 아님 | thread 실행·streaming/resume 제공. 언어/버전별 cancellation 세부 동작은 미검증 | CLI 인증 경계·설치 런타임을 별도 검증해야 함. 미채택 |
| Claude Agent SDK | agent runtime이 도구 실행. canUseTool은 모든 호출의 유일한 문이 아님. 이전 permission/allow 단계에서 결정될 수 있음. tools 집합 제한 및 전체 runtime 경계 검증 필요 | 구조화 출력/streaming, resume, interruption 기능은 SDK 경로별 계약 검토 필요; 로컬 실행 검증 안 함 | 제3자 제품의 claude.ai 로그인/한도 제공은 사전 승인 조건이 있으므로 CLI 구독 재사용을 가정하지 않음. API 인증을 기준으로 검토. 미채택 |
| OpenAI Responses 직접 요청 | tools=[], tool_choice=none, 도구 runner 없음. 응답의 비-message 항목 거절 | JSON schema text.format, 단일 응답. 이번에는 streaming/background/session/previous_response_id 없음. 로컬 timeout/connection 취소만 집행 | 향후 별도 Platform API 인증·사용량 과금. 기존 Codex 토큰 복사 없음. **프로토콜 오프라인 구현 선택** |
| Anthropic Messages 직접 요청 | tools=[], SDK Tool Runner 없음. text 외 tool_use/server tool 응답 거절 | output_config.format, 단일 text response; 이번에는 세션 재사용·streaming 없음 | 향후 별도 API 인증·과금. 실제 키 사용 없음. **프로토콜 오프라인 구현 선택** |

공식 근거: [App Server](https://learn.chatgpt.com/docs/app-server), [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [Codex 인증](https://learn.chatgpt.com/docs/auth), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [SDK 권한 평가](https://code.claude.com/docs/en/agent-sdk/permissions), [OpenAI 구조화 출력](https://developers.openai.com/api/docs/guides/structured-outputs), [Anthropic 구조화 출력](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Anthropic 인증](https://platform.claude.com/docs/en/manage-claude/authentication).

특정 모델의 schema 지원·reasoning 이벤트·비용은 이번에 측정하지 않았다. no-tools 요청이 실제 서비스에서 어떤 출력과 정책으로 처리되는지는 Live 검증 대상이다. SDK/CLI 설정을 바꾸거나 구독 토큰을 일반 API 키처럼 사용하는 구현은 없다. 별도 계약된 기업 인증/게이트웨이 가능성도 이번 구현 범위가 아니다.

## 실제 변경과 재사용

| 파일 | 변경 책임 |
| --- | --- |
| `src/providers/model-api.mjs` | 최소 요청 빌더·엄격한 응답 파서·오프라인 HTTP 전송·공통 Provider 결과·Planner 연결 |
| `src/providers/registry.mjs` | Provider 필수 조건과 함께 filesystem_restriction/network_restriction/credential_isolation 필수 검사. 필드 자체가 없을 때도 안전한 거절 |
| `test/model-api.test.mjs` | Fake HTTP Server·가짜 인증정보 기반 신규 반증·통합 테스트 |
| `test/providers.test.mjs` | 환경 보고서 미제공 반례 보강, 모의 환경 근거 명시 |
| `test/intent.test.mjs`, `test/workflow.test.mjs`, `test/hybrid.test.mjs`, `test/product.test.mjs` | 기존 성공 fixture에 새 필수 환경 근거 명시. 기존 테스트·기대값 유지 |
| `package.json` | 새 suite를 기존 test:alpha에 포함 |
| INDEX, README 두 개, product progress | 신규 기록 연결 및 기록 수 갱신 |

`src/providers/model-api.mjs:32`의 요청 빌더는 허용 필드만 만든다. `src/providers/model-api.mjs:41`에서 응답 model/id/type/status/content 구조를 확인하고, G2 validateRequest와 V1 applyEdits 또는 G3 validateSemanticProposal로 최종 검증한다. 모델이 authority나 실행 완료 필드를 제안에 끼우면 기존 정확한 키 검증이 거절한다.

`src/providers/registry.mjs:24`의 공통 hard gate는 기존 G3 planIntent·G6 semanticPlan·G4/G5 Controller와 proposeSelected가 재사용한다. 호출자가 environmentRequired=[]를 주어도 필수 항목을 제거할 수 없다. 기존 V1 Claude compatibility 경로는 그대로 두며 새 보안 인증으로 표시하지 않는다. G1 Judge, Store 스키마·마이그레이션, DAG, lease, recovery, delivery는 수정하지 않았다.

## 실제 집행 경계

- 생성자는 정확한 `http://127.0.0.1:<port>/v1/responses` 또는 `/v1/messages`만 허용한다. localhost/DNS, IPv6, 사용자정보, query, 외부 주소, 파일 URL, 다른 route를 거절한다. redirect를 따라가지 않고 proxy 환경변수를 읽지 않는다. 이는 **오프라인 전송 코드의 allowlist**이며 호스트 전체의 방화벽 인증은 아니다.
- 인증은 생성자 closure의 `G7B_FAKE_...` 형식만 허용한다. 실제 환경변수·홈·CLI credential store를 읽지 않는다. 가짜 credential은 HTTP 인증 header에만 사용하고 모델 입력 body에 넣지 않는다. 응답 반사는 실패 처리하고 raw 기록에서 제거한다. 실제 broker/OS credential vault는 구현하지 않았다.
- 요청에 tools/headers/endpoint/sessionId/권한 override를 넣으면 거절한다. stream=false, 제한된 출력 token 수, request body 크기 상한, timeout 상한, response 256 KB 상한을 적용한다. 임의 헤더·정책·모델명 override를 Offline Adapter가 받지 않는다.
- fs/process/tool 실행 함수가 없는 데이터 전송 경로다. 응답의 file/shell/fetch/MCP/web/code interpreter 호출을 dispatch하지 않는다. 제안의 newText에 코드가 포함될 수 있지만 이 계층은 실행하지 않는다. 편집 적용·테스트는 기존 Harness 경계에서만 이루어진다.
- host requestId·inputHash·전체 requestHash로 요청을 결합하고 같은 객체 중복 사용을 거절한다. 요청 도중 내용·예산 변경, cancelled, isCurrent=false인 결과는 반환하지 않는다. isCurrent는 모델 입력이 아니라 신뢰된 호스트 callback이다. 프로세스 재시작에 걸친 Attempt 소유권·재실행 방지는 기존 SQLite/Lease/Fencing이 담당한다.
- timeout/취소 시 로컬 HTTP 연결을 종료하고 자동 재시도하지 않는다. 원격 모델의 실제 계산 종료나 비용 취소를 뜻하지 않는다. 응답 usage는 PROVIDER_REPORTED_ONLY이며 cost=null을 유지한다. 비용을 모르는데 0으로 채우지 않는다.

## Capability의 범위

| 경로 | 이번 상태 |
| --- | --- |
| openai-model-offline / anthropic-model-offline | OFFLINE_LOOPBACK_FAKE_ONLY. 도구 없는 요청·로컬 취소·schema 검증·고정 네트워크·가짜 credential 경계를 테스트 |
| 같은 Adapter의 SUPPORTED 필드 | 그 오프라인 호스트 구현에만 해당. 실제 OpenAI/Anthropic Capability의 VERIFIED로 승격하지 않음. liveValidation=NOT_RUN |
| Codex CLI / Claude strict CLI | 기존 UNVERIFIED/차단 유지 |
| Live 직접 API / 실제 키 / HTTPS egress / TLS / 비용 상한 | 실행 경로 미제공·미검증. BLOCKED_OR_UNSUPPORTED |
| session_support / streaming_output / usage_reporting / approval_integration | 새 Adapter는 미검증 유지. 선택 가능 여부는 최소 필수 항목과 별도 정책으로 결정 |
| SANDBOXED_AGENT / 범용 host OS 격리 | 미지원. 이번 no-tool 경로와 다른 계약 |

## 테스트와 실패 분석

최초 신규 suite는 9 통과/2 실패, exit 1이었다. 실패는 API usage에서 비용을 추정하지 않아 Workflow가 최종 통합 전 cost unknown으로 멈추는 기존 계약이었다. 정책을 바꾸지 않고 unknown cost 경로의 WAITING_HUMAN과 WorkItem의 실제 검증 성공을 함께 단언했다. 별도 통합 fixture에서만 신뢰된 테스트 호스트가 아는 Fake Server 비용 0을 주입해 완료·report·재실행 방지를 검증했다. 일반 Adapter는 계속 cost=null이다.

첫 전체 회귀에서도 Intent fixture 두 개가 실패했다. environment 필드 자체가 없을 때 발생한 TypeError를 명시적인 Capability 거절로 고쳤다. 기존 Fake Planner에 모의 환경 근거를 명시하고 원래 기대값을 유지했다. 실패 로그도 보존한다.

| 검증 | 결과/범위 |
| --- | --- |
| 첫 변경 모듈 묶음 | exit 0, 82 통과/3 Docker 제외; 제외를 통과로 세지 않음 |
| 최종 신규 suite 단독 | exit 0, 13 통과/제외 0 |
| Intent 및 신규 suite 수정 확인 | exit 0, 27 통과/제외 0 |
| 전체 npm.cmd test 최초 | exit 1. Legacy 324 통과, Alpha 계열 136 통과/2 실패/제외 0. [실패 로그](codefleet-g7b-full.log) |
| 전체 npm.cmd test 최종 재실행 | exit 0. Legacy 324 + Alpha 계열 138 = **462 통과**, 실패·제외 0. [최종 로그](codefleet-g7b-full-final.log) |
| 기록 반영 후 npm.cmd run posttest | exit 0. 선언 42개 중 불일치 0, 미앵커 숫자 539는 기존 baseline 유지. [로그](codefleet-g7b-docs-final.log) |

위 코드 위치는 미커밋 작업 트리 기준이다. dated citation 검사는 기준 HEAD에 새 파일이 없다는 경고 2개를 출력하며 기존 경고 11개도 남는다. 경고를 숨기거나 기준 커밋의 구현으로 주장하지 않는다. [소스 근거](alpha-g7b-source-evidence.json)에 변경 코드·테스트·package 파일 9개의 실제 SHA-256과 핵심 모듈 11개의 HEAD 대비 보존 결과를 기록했다. 최종 git diff --check는 exit 0이다.

전체 실행 옵션은 CODEFLEET_TEST_DOCKER=1, CODEFLEET_TEST_JAVA=(Get-Command java).Source, CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45였다. 기존 Node/Maven Docker·JDK·마이그레이션·복구·Hybrid 충돌·최종 tree 변조·CLI 회귀를 포함한다. 이미지 새 설치나 실제 Provider 호출은 없다. 첫 변경 모듈 묶음의 [제외 포함 로그](codefleet-g7b-focused.log)도 보존했다. Doctor는 이번에 별도 실행하지 않았다. 기존 로그인 상태를 조회하는 경로를 이 오프라인 작업의 인증 검증으로 사용하지 않았다.

새 테스트는 정상 구조화 제안, tool/server-tool/MCP 거절, 잘못된 JSON·schema·scope·model, 보호 테스트 변경 거절, redirect에 의한 인증 전송 방지, 가짜 키 반사/이스케이프 redaction, 출력 크기 제한, timeout·취소·stale callback·요청 변조·재사용, 실제 파일 미변경·추가 HTTP 미호출, Planner 코드 인용 검증, Sequential/Hybrid 공통 환경 게이트를 검증한다. 새 Workflow 통합 테스트는 임시 Git·SQLite와 실제 Node regression subprocess를 사용한다. source repo는 변경되지 않는다.

G6 CLI의 기존 dispatchProduct report로 최종 tree/evidence를 재검증한다. Offline Adapter 주입은 trusted host 테스트 지점이며 공개 CLI 실행 옵션 추가가 아니다. Provider 응답 자체의 검증 주장으로 완료하지 않는다. 동시 요청의 고유 binding은 검증했지만 새로운 일반 분산 replay 시스템을 만들지 않았다.

## 최소 Live 검증 전 조건

1. 별도 승인된 모델·프로토콜 버전과 JSON Schema subset을 확정한다. 현재 파서는 단일 text/message만 허용하므로 실제 reasoning/refusal/multi-content 응답은 안전하게 실패할 수 있다.
2. 호스트 소유 HTTPS 전송·TLS·인증정보 공급 및 redaction·목적지 allowlist·redirect/proxy/DNS/IPv6 반례를 구현한다. 실제 비밀과 정책을 모델/저장소에 제공하지 않는다. 이번 loopback 증거로 외부 egress를 인증하지 않는다.
3. host 비용 예약·최대 출력·요청 수·불명확한 원격 종료/비용 reconcile 정책을 확정한다. 현 unknown cost 게이트를 통과시키려고 값을 추정하지 않는다.
4. Provider/환경별 유효기간·버전·정책 hash와 연결된 실행 근거로 Live Capability를 평가한다. offline SUPPORTED 값을 복사하지 않는다.
5. 실제 API 인증·요금·모델 호출 승인을 별도로 받고 최소 단일 Provider부터 검증한다. CLI 구독과 별도 API 결제를 혼동하지 않는다. 두 Provider 개별 검증 전 실제 병렬 협업 금지.

## 결론

C 경로의 최소 오프라인 구현·필수 회귀가 완료됐다. 도구 실행 루프 없이 기존 Provider·Planner·Workflow·Judge에 연결했으며 실제 서비스 호출 준비 완료를 뜻하지 않는다.
Live 모델·API 키·Codex 실행 차단은 유지한다. 결과는 오프라인 검증 범위와 Live 미지원 범위로 구분한다.

- 다음 작업: Live 전송/인증/비용/attestation 경로를 별도 범위로 승인받아 가짜 upstream에서 먼저 검증.
- 미해소로 남긴 것: Live 모델 schema/event 호환성, 실제 인증·별도 과금, 원격 취소·비용 정산, TLS/외부 egress, OS 전체 격리, 실제 Codex·Claude 협업.
