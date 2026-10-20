# G7-C1/C2 — 제한 HTTPS 전송과 Provider 호환성의 오프라인 검증

- 일시: 2026-10-20, Asia/Seoul
- 유형: 구현·실행·검증
- 작업 공간: `.codefleet/worktrees/alpha-g0`, branch `feature/alpha-g0-refresh`
- 기준 HEAD: `effb42b501c25865b19d955cea828cc5a7eb4b08`
- 선행 문서: [G7-B 구현과 검증](alpha-g7b-proposal-only-model-interface.md), CLAUDE.md, 기존 설계 패키지와 G1~G6 기록.
- REGISTER 실측 최대 번호: P0-17, P1-61. 신규 결함 번호·등급 변경 없음.
- 기존 미커밋 G7-B 변경, `.trials/`, G0 감사 자료를 보존했다. 실제 모델 호출·실제 API Key 사용·원격 PR·배포·커밋·푸시는 하지 않았다.

## 판정과 범위

G7-C1/C2의 제한 전송·응답 계약을 구현하고 **로컬 TLS 서버 및 가짜 인증정보 범위**에서 검증했다. 외부 API 연결은 실행하지 않았으며 Live Adapter는 `LIVE_CAPABILITY_UNVERIFIED`로 계속 차단한다. 구현 존재를 Live 인증·과금·모델 동작의 증거로 삼지 않는다.

decision-debt preflight는 사용자 지정 선행 기록 한 건을 대상으로 최종 판단 0, 제외 후보 1, 경고 0이었다. 제외 후보는 선행 기록의 보안 경계 설명에 대한 민감 맥락 분류였고, 구현을 막는 근거는 없었다. 전 프로젝트나 Live 보안 인증을 뜻하지 않는다.

| 분류 | 확인한 범위 |
| --- | --- |
| VERIFIED | 로컬 TLS 인증서·호스트 검사, 인증정보 전달 분리, 요청/응답 제한, HTTP 오류·취소·Timeout, 구조화 제안의 독립 계약 검사, 기존 전체 회귀 |
| IMPLEMENTED_NOT_LIVE_VERIFIED | 공식 endpoint 상수, Provider별 헤더·요청 schema 변환·응답 정규화 및 모델 ID 호환 계약 |
| BLOCKED_OR_UNSUPPORTED | 실제 API 실행, 엄격한 금액 상한, 실제 청구/원격 취소 확인, Codex CLI PROPOSAL_ONLY, SANDBOXED_AGENT, Live 병렬 협업 |

## 실제 변경 파일과 재사용

| 파일 | 변경 |
| --- | --- |
| `src/providers/model-transport.mjs` | 제한 HTTPS, 명시적 인증 주입, 호스트/모델 allowlist, schema subset, 비용 불확실성 |
| `src/providers/model-api.mjs` | 기존 Adapter 실행기를 공유하고 HTTPS Adapter 연결. Refusal/Incomplete/Invalid JSON 분류 추가 |
| `test/model-transport.test.mjs` | TLS 실서버 기반 정상·반증 테스트 |
| `test/fixtures/model-tls/` | 공개용 가짜 인증서·키 4개와 용도 설명. 실제 인증정보 아님 |
| `package.json` | 기존 test:alpha에 신규 테스트 추가 |
| `README.md`, `README.en.md`, `docs/INDEX.md`, `docs/product-completion/progress.md` | 기록 색인·실측 문서 수·현 상태 |
| 이 기록, `alpha-g7c-source-evidence.json`, `codefleet-g7c-*.log` | 실행 근거 및 소스 해시 |

주요 근거는 작업 트리의 src/providers/model-transport.mjs:6, src/providers/model-transport.mjs:74, src/providers/model-api.mjs:92다. 새 파일은 기준 HEAD에 없으므로 dated citation 경고는 예상되며, 해당 커밋에 이미 구현됐다는 주장이 아니다. [소스 근거](alpha-g7c-source-evidence.json)에 코드·테스트·fixture·package 9개 해시, 핵심 모듈 11개 HEAD 대비 동일성, 수정하지 않은 G7-B 파일 7개의 선행 해시 동일성을 기록했다.

기존 G2 Registry의 Provider/Environment 필수 검사, G3 Planner 의미 검증, G4/G5 Coordinator·Lease/Fencing, G1 Judge, G6 CLI를 그대로 사용한다. HTTPS 실행기는 기존 `payload`, 요청 binding·불변 검사, `applyEdits`, `validateSemanticProposal`을 재사용한다. 신규 상태 DB·마이그레이션·별도 실행 엔진·CLI endpoint 옵션은 없다. 기존 Claude CLI와 차단된 Codex CLI도 그대로다.

## 전송 및 인증 경계

- 공식 목적지는 `https://api.openai.com/v1/responses`, `https://api.anthropic.com/v1/messages`로 고정했다. 사용자가 URL·hostname·headers·TLS 옵션을 지정하는 경로는 없다.
- `https.request`에 인증서 검증, 호스트 검사, 최소 TLS 1.2, Node bundled CA를 명시했다. 새 연결을 사용하며 proxy 환경변수·global agent·redirect·자동 retry를 사용하지 않는다. 추가 사설 CA가 필요한 환경은 현재 미지원이다. [Node HTTPS 옵션](https://nodejs.org/api/https.html)
- 테스트 전용 생성자는 숫자 loopback 주소와 port, 가짜 CA만 사용한다. 가짜 키 접두사와 Provider를 검사하므로 실제 키를 공급할 수 없다. 일반 Live 생성자에는 테스트 설정을 넣을 수 없다. 테스트 CA를 시스템 신뢰 저장소에 등록하지 않았다.
- 환경 전체를 읽지 않는다. trusted host가 해당 Provider의 `CODEFLEET_OPENAI_API_KEY` 또는 `CODEFLEET_ANTHROPIC_API_KEY` 항목만 포함한 map을 명시적으로 주입하는 계약이다. 반대 Provider 변수, 누락, 개행/잘못된 형식은 거절한다. 실제 키의 유효성·권한은 오프라인 문법 검사로 증명할 수 없다.
- 키는 Transport closure와 해당 인증 헤더에만 사용한다. 키가 입력에 있으면 전송 전에 차단하며, 응답에서 원문 또는 JSON escape 형태로 반사되면 raw까지 폐기한다. HTTP 오류 body는 저장하지 않고 고정 오류 코드만 반환한다. 실제 키나 CLI 인증 파일을 읽거나 복사하지 않았다.
- OpenAI는 Bearer 헤더, Anthropic은 `x-api-key`와 `anthropic-version: 2023-06-01`을 사용한다. 서로의 인증 헤더는 보내지 않는다. [OpenAI 인증](https://developers.openai.com/api/reference/overview), [Anthropic 인증](https://platform.claude.com/docs/en/manage-claude/authentication)
- 전송 body 220,000 bytes, 응답 256,000 bytes, HTTP header 16,384 bytes 상한이다. 기존 입력 문맥 제한도 유지한다. 요청 timeout은 기존 계약 범위 내이며 전송 최대 180초, 취소/Fencing 검사는 10ms polling이다. 연결 종료는 원격 과금 취소 확인이 아니다.

이는 신뢰된 호스트 프로세스 내부의 경계다. 악성 호스트 코드·OS 관리자·프로세스 메모리 접근을 격리하는 Sandbox는 아니다. 모델에는 파일·shell·네트워크 도구나 dispatch loop를 제공하지 않는다.

## Provider 요청·응답 및 버전

| 항목 | OpenAI | Anthropic |
| --- | --- | --- |
| 프로토콜 | Responses | Messages, API version 2023-06-01 |
| 제한된 호환 fixture 모델 | `gpt-4o-2024-08-06` | `claude-sonnet-4-5-20250929` |
| 구조화 출력 | `text.format`, json_schema, strict | `output_config.format`, json_schema |
| 도구·세션 | tools 빈 배열, tool_choice none, store false, stream false | tools 빈 배열, stream false, tool runner 없음 |
| 허용 결과 | 일치하는 model/id, completed 단일 assistant message/output_text | 일치하는 model/id, end_turn 단일 assistant text |
| 안전 실패 | refusal, incomplete, malformed JSON, 도구/미지원 content | refusal, max_tokens, malformed JSON, tool_use/미지원 content |

모델 목록은 품질 평가나 최신 모델 추천이 아니라 좁은 프로토콜 allowlist다. 공식 문서에 Structured Outputs 지원이 설명되어 있다. wire schema는 typed enum 및 지원되는 구조만 보내고 일부 수량/범위 제약은 호스트 검증기에 남긴다. schema 변환이 원래 완료 기준을 완화하지 않도록 빈 edits 반례도 검증했다. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

Anthropic의 이 snapshot은 공식 문서상 2026-11-30 종료 예정이다. 따라서 현재 fixture 호환성만 확인했고 Live 승인 전에 활성 모델 선정·회귀를 다시 해야 한다. 임의로 최신 alias를 허용하거나 응답 모델 불일치를 무시하지 않는다. [모델 수명 주기](https://platform.claude.com/docs/en/about-claude/model-deprecations)

Live probe는 `liveValidation: NOT_RUN`, Provider 및 Environment Capability는 `UNVERIFIED`, executionBlocked를 반환한다. 테스트 전용 SUPPORTED는 `OFFLINE_TLS_FAKE_ONLY` 범위이며 Live attestation으로 복사하지 않는다. 공통 Registry는 Live 후보를 거절하고 직접 execute도 전송 전에 차단한다.

## 사용량·비용·재시도

- 전송 전 계약 예산이 유한·양수·상한 이내인지, 출력 토큰 상한이 4,096 이하인지 확인한다. 입력은 byte 상한이며 실제 input token 수를 측정했다고 주장하지 않는다.
- `usage`는 Provider 원본 보고다. 유효한 비음수 정수 input/output token이 모두 있을 때만 `accounting.usageStatus=PROVIDER_REPORTED_ONLY`와 정규화한 tokens를 기록한다. 누락/음수/문자열은 UNKNOWN이다.
- 실제 청구 근거와 검증된 가격표가 없으므로 `cost`와 `estimatedCostUsd`는 null이다. 추정값으로 Controller의 unknown cost 예약을 해소하지 않는다. `hardCostCap=UNSUPPORTED`다. 엄격한 금액 상한을 요구하는 Live 정책은 충족하지 못한다.
- TLS 연결 전 실패는 NOT_SENT, 연결 성립 이후 timeout/취소/응답 유실·오류는 UNKNOWN으로 남긴다. remote completion·청구가 취소되었다고 표시하지 않는다.
- HTTP 401/403/429/5xx와 redirect를 분류하고 자동 retry/Retry-After 추종을 하지 않는다. 같은 Adapter에 같은 요청 객체를 다시 제출하면 ATTEMPT_REUSED다. 내구성 있는 전체 Attempt 소유권은 기존 Coordinator·Store가 담당한다. 새 객체/새 프로세스에 대한 독립적인 API idempotency 보장을 구현했다고 주장하지 않는다.

## 실제 실행 결과

| 명령 | 종료 코드·범위 |
| --- | --- |
| `node --test test/model-transport.test.mjs test/model-api.test.mjs` | 0, 첫 집중 검증 27/27 통과, 실패·제외 0. 이후 TLS 환경 우회 반례를 추가해 전체 실행에 포함. [로그](codefleet-g7c-focused.log) |
| `node src/alpha/cli.mjs doctor` | 0, 검사 5/5 통과. Node v24.14.1, Claude Code 2.1.303, Git·gh·기존 Claude 인증 여부·Docker 준비 확인. 계정 식별자/토큰 출력 없음. API 키 유효성이나 모델 호출 검증 아님. [로그](codefleet-g7c-doctor.log) |
| `npm.cmd test` | 0, Legacy 324 + Alpha 확장 153 = 477건 통과, 실패 0, 제외 0. 신규 TLS 15건 포함. posttest까지 성공. [로그](codefleet-g7c-full.log) |

전체 실행 환경은 `CODEFLEET_TEST_DOCKER=1`, `CODEFLEET_TEST_JAVA=(Get-Command java).Source`, `CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45`였다. 실제 Node/Maven Docker와 JDK, G1~G7-B, SQLite 마이그레이션·복구, Workflow/Hybrid 충돌·취소·Fencing·최종 tree, CLI 회귀를 포함한다. 새 의존성 설치나 이미지 다운로드는 없었다.

신규 TLS 테스트는 정상 제안, 잘못된 CA/호스트명, 허용되지 않은 endpoint/설정, Provider별 가짜 키 격리·누락·형식·잘못된 공급, 키 반사/JSON escape, 401/403/429/500/503/302, 크기 제한, 불완전 HTTP, 잘못된 Content-Type, timeout/cancel/stale/계약 변경, refusal/incomplete/JSON/schema/모델 불일치/tool 출력, 사용량 누락, 재시도 방지를 검사한다. TLS 검증 비활성 환경변수와 proxy 환경변수를 주입해도 인증서 거절이 유지되는 것을 확인했다. Node의 TLS 환경변수 경고는 이 의도적인 반증 테스트에서 발생하며 실제 전송 검증은 비활성화되지 않았다.

문서 추가 후 `npm.cmd run posttest` 첫 시도는 sandbox의 Git 조회 실패(exit 128) 때문에 명령 exit 1로 중단됐다. [실패 로그](codefleet-g7c-docs-failed.log)를 보존했다. 동일 검사를 정상 Git 권한으로 재실행해 exit 0을 확인했다. [최종 문서 검사](codefleet-g7c-docs-final.log): 선언 42개 중 불일치 0, 미앵커 539개는 기존 baseline 539 유지. 기존 dated citation 의심 13개와 커밋 미지정 10개는 그대로 남는다. 전체 문서 사실을 검증했다는 뜻이 아니다. 기존 역사 기록을 삭제하거나 baseline을 낮추지 않았다.

추가 공개 자료 점검은 새 소스·fixture·로그·보고서 16개에서 로컬 사용자명(문자열/URI 인코딩)과 실제 API 키 형태를 검사해 위반 0건, Node 검사 exit 0이었다. 알려진 테스트 PEM은 공개 가짜 자료로 별도 명시했다. 임의의 비밀 전부를 식별하는 완전한 secret scanner라는 주장은 아니다. `git diff --check`는 exit 0이었다.

## 최소 Live 실행 전 준비사항과 남은 제약

1. 사용자 별도 승인으로 Provider·활성 모델·작은 입력·최대 호출 수·예산 및 unknown 비용 중단 정책을 확정해야 한다.
2. 해당 Provider API 계정·과금 준비와 최소 권한 API 키를 안전한 로컬 공급 경로에 준비해야 한다. 키를 대화·저장소·실행 Artifact에 넣지 않는다. CLI 구독 토큰 재사용 경로는 없다.
3. Live attestation과 승인 연결, 실제 모델/API 응답 호환성, 가격표·비용 예약/정산 정책을 검증한 뒤에만 현재 실행 차단을 변경할 수 있다. 현재는 설정만으로 해제할 수 없다.
4. OS별 secret store·별도 자격증명 broker, 기업 proxy/CA, 외부 DNS/egress 및 실제 서버 인증, streaming/reasoning/multi-content, 원격 취소·중복 청구 방지는 미검증 또는 미지원이다.
5. 단일 Provider부터 별도 opt-in으로 검증해야 한다. 두 Provider Live 협업 및 Codex CLI 도구 차단이 해결됐다고 표시하지 않는다.

## 결론

제한된 HTTPS·인증·응답 계약과 오프라인 반증·전체 회귀를 검증했다. Live 운영 준비 완료는 아니다.
엄격한 비용 보장과 Live Capability는 미지원/미검증으로 유지한다. 기존 Judge·승인·복구·전달 계약은 보존했다.

- 다음 작업: 별도 승인된 최소 Live 검증을 위한 활성 모델·비용 정책·attestation 설계 확정.
- 미해소: 실제 API 인증/호환성/과금·원격 취소, 외부 환경 검증, Live 실행 게이트, Codex CLI와 멀티 Provider Live 협업.
