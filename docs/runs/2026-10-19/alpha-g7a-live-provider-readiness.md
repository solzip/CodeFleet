# G7-A — Live Provider 준비 및 보안 차단 분석

- 작업 일시: 2026-10-19, Asia/Seoul
- 유형: 감사·오프라인 실행·설계 검토. 제품 구현 변경 없음.
- Worktree: `.codefleet/worktrees/alpha-g0`, branch `feature/alpha-g0-refresh`
- 기준 HEAD: `c61e9b829b62dd41336a7225bf3b9165136484db`
- 선행 문서: [G6](alpha-g6-product-integration.md), CLAUDE.md, docs/CONVENTIONS.md.
- 판정: **G7-A 진단 완료. Live Provider 실행은 여전히 NO-GO.** 실제 모델·인증 흐름·외부 PR·배포 실행 없음.
- 신규 결함 번호 부여 없음. 기존 동결 REGISTER의 등급·상태 변경 없음.

## 범위와 보존

실제 branch·HEAD·미커밋 파일을 확인했다. G1~G6 작업은 그대로 보존했다. `src/`, `test/`, `scripts/`, package.json의 파일 121개를 실행 전후 SHA-256으로 비교해 일치했다. [진단 JSON](alpha-g7a-diagnostics.json)에 두 manifest가 있다. 제품 소스·기존 테스트·DB·설정·정책·Capability 값을 수정하지 않았다.

이번 변경은 이 기록, [재현용 오프라인 진단](g7a-security-diagnostic.mjs), 진단 JSON 및 Provider 회귀 로그, INDEX와 README 두 개의 기록 수 정합성 갱신이다. G6 한국어 README의 본문 71과 fact 73 불일치도 새 실측 기록 수로 맞춘다. 기존 검증 자료를 덮어쓰지 않는다.

decision-debt는 사용자 지정 G6 기록 한 개를 **review triage**로 조사했다. 후보 1, 제외 0이며 preflight 승인이 아니다. 격리 구현과 별도 Live 검증 보류를 정체로 분류한 후보는 실행 없는 계획이라는 결론을 지지하지 않는다. G6 코드·테스트·기록을 직접 확인하고 현재 Live 미검증만 유지한다. 외부 문서는 기능 설명의 보조 근거이며 설치본의 집행 증거로 승격하지 않는다.

## 실제 설치와 Capability

Windows / Node v24.14.1에서 version/help만 실행했다. Codex npm shim은 Alpha의 native executable 규칙에 맞지 않는다. 기본 `codex.exe` Probe는 설치를 확인하지 못했고 npm 패키지의 native exe를 명시한 Probe는 성공했다. 경로 문제를 해결해도 보안 차단은 남는다. Claude 2.1.303, Codex 0.162.1이며 각각 version/help exit 0이다. Docker Server는 Linux 24.0.6이다.

| Capability | Claude Code | Codex CLI | 이번에 확인한 수준 |
| --- | --- | --- | --- |
| non_interactive_execution | --print | exec | 도움말 광고, 실제 모델 미호출 |
| structured_output | --json-schema / structured_output 파서 | --output-schema / JSONL agent_message 파서 | Fake 파서 회귀, Live 미검증 |
| proposal_only | --tools 빈 값, MCP 빈 설정 | 검증된 no-tool 옵션/경로 없음 | 둘 다 Probe UNVERIFIED; Codex 직접 호출도 차단 |
| session_support | --resume 광고 | resume/fork 광고 | 공통 요청은 sessionId 거절; 재사용 미지원 |
| streaming_output | --output-format stream-json | --json | 현재 Claude Adapter는 단일 JSON; Codex 파서는 제한된 JSONL |
| cancellation | 호스트 timeout/process 종료 | Adapter 실행 경로 없음 | 기존 Fake/process 회귀만; Live 원격 취소·비용 정산 미검증 |
| usage_reporting | total_cost_usd/usage | turn.completed usage, cost=null | Provider 주장으로 별도 저장; 실제 청구 상한 증명 아님 |
| approval_integration | permission-mode 광고 | shell 승인/Sandbox 관련 옵션 | CodeFleet 계약 승인과 별개; Live 통합 미검증 |
| filesystem_restriction | 현재 Adapter OS 격리 없음 | read-only shell 정책 광고 | Provider 전체 프로세스 집행 미검증 |
| network_restriction | 현재 Adapter egress 집행 없음 | Sandbox 옵션만으로 본체 통신 제한 입증 불가 | Provider 전체 프로세스 집행 미검증 |
| credential_isolation (Environment) | 자체 인증변수와 HOME 계열 전달 | 실행 차단 | 실제 인증정보 접근 검사 안 함; 가짜 정보만 사용 |

Probe의 capability status는 전부 UNVERIFIED 또는 기본 Codex 탐색 실패 시 UNAVAILABLE다. 위 표의 광고·파서 통과를 SUPPORTED로 해석하지 않는다. Docker 진단은 Provider와 다른 실행 환경이다.

## 정확한 차단 원인과 코드 근거

작업 트리 기준 위치이며 HEAD에 포함된 코드라고 주장하지 않는다.

1. `src/providers/capabilities.mjs:12`: Probe는 version/help 성공만 확인한다. 실행 검증·버전별 보안 인증·attestation 저장/검증 경로가 없어 설치돼도 UNVERIFIED다.
2. `src/providers/registry.mjs:19`: non_interactive_execution, structured_output, proposal_only는 필수다. 하나라도 SUPPORTED가 아니면 선택을 거절한다. 단순 설치 실패만이 차단 원인이 아니다.
3. `src/providers/codex.mjs:26`: execute는 입력과 무관하게 CAPABILITY_UNVERIFIED/BLOCKED를 반환한다. 실행 명령 자체가 없으므로 보고서를 조작해도 현재 Codex를 실행할 수 없다. 이는 의도된 안전 차단이다.
4. `src/providers/codex.mjs:4`: thread.started/turn.started, 단일 item.completed(agent_message), turn.completed만 처리한다. tool·reasoning·미지 이벤트·완료 뒤 이벤트를 거절한다. 실제 설치본 JSONL 전체 호환성은 미검증이며 정상 추론 이벤트도 거절할 수 있다. 원문은 normalize에서 보존하지만 파싱 실패 시 구조화 events는 비어 있을 수 있다. 사후 파서 거절은 이미 수행된 도구 부작용을 예방하지 않는다.
5. `src/providers/claude.mjs:8`: --tools 빈 값, --strict-mcp-config, 빈 MCP, setting-sources 빈 값, disableAllHooks, no-session-persistence, max-budget-usd를 유지한다. `src/alpha/process.mjs:3`은 환경변수 allowlist이지 파일 읽기/쓰기 정책이 아니다. HOME·USERPROFILE·APPDATA 등을 유지하고 `src/alpha/process.mjs:35`는 같은 사용자 권한으로 spawn한다. shell:false는 shell 문자열 해석 방지이지 자식 실행 금지가 아니다.
6. `src/alpha/provider.mjs:9`: 기존 V1 Claude 호환 경로는 strict routing을 거치지 않는다. 이번에는 변경하거나 실행하지 않았다. 과거 제한적 Alpha 정상 경로를 새 강한 OS 격리 인증으로 부르지 않는다.
7. **향후 활성화 전 필수 연결 사항**: registry의 environmentRequired 기본값은 빈 배열이다. `src/alpha/controller.mjs:261`과 `src/intent/semantic.mjs:46`은 이를 지정하지 않는다. 현재 mandatory Provider capability 미검증으로 막히지만, 나중에 Provider 값만 SUPPORTED로 변경하면 환경 검증이 자동으로 추가되지 않는다. 정책이 요구하는 FS/network/credential attestation을 실행 직전 필수로 연결해야 한다. 현재 프로덕션 우회가 재현됐다는 주장은 아니다.

Codex exec help의 read-only는 모델이 생성한 shell 명령의 Sandbox 정책이다. no-tool·credential isolation과 같지 않다. --ignore-user-config도 auth는 CODEX_HOME을 사용한다고 명시한다. --ephemeral은 실행 권한 제한이 아니다. 위험 bypass·추가 쓰기 경로·설정 override 옵션을 사용자/모델 입력에서 그대로 전달해서는 안 된다. 이번에는 그런 옵션으로 Provider를 실행하지 않았다. [공식 CLI 설명](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

Claude 공식 설명은 --tools와 --allowedTools의 역할을 구분한다. 전자는 사용 도구 집합, 후자는 승인 없이 사용할 도구다. bare 모드도 no-tool이 아니다. 설치 help와 기존 인자가 맞는다는 사실까지만 확인했다. [Claude CLI](https://code.claude.com/docs/en/cli-reference).

Claude의 내장 Sandbox는 shell 계층이며 native Windows는 미지원이라고 문서화돼 있다. file/web tools·MCP·hooks까지 감싸려면 별도 전체 프로세스 경계가 필요하다. 이 설명을 실제 로컬 집행 검증으로 대체하지 않는다. [Claude Sandbox](https://code.claude.com/docs/en/sandboxing).

## 모델 없는 실제 보안 재현

재현 명령: `node docs/runs/2026-10-19/g7a-security-diagnostic.mjs <codex-native-exe>`.
처음에는 진단 파일의 상대 import를 한 단계 잘못 지정해 ERR_MODULE_NOT_FOUND, exit 1이었다. 진단 파일만 수정 후 exit 0, 상위 확인 11/11. 컨테이너 내부 확인은 별도 15/15이며 두 수를 합산해 보안 보장 건수로 부르지 않는다. 통과에는 **위험이 남음을 확인한 반례**도 포함된다.

임시 fake-home/workspace만 만들고 실제 인증 파일·키·계정 내용을 읽지 않았다. 모델 프로세스 대신 Node payload를 사용했다. Docker는 기존 image `sha256:e8c4de1e2519b4f34de27a595df6c2a32df28baa90db80bfaf2e038889d94390`를 pull 없이 실행했다. 호스트 repo·home·DB·Docker socket은 마운트하지 않았다. 컨테이너는 종료 후 --rm, 임시 fake fixture만 남는다.

| 검증 | 실제 관측 | 해석 |
| --- | --- | --- |
| 기존 process envelope의 fake-home 읽기/쓰기 | 모두 가능 | cwd·환경변수 필터는 OS 격리 아님 |
| 기존 envelope의 자식 Node 실행 | 가능 | 미승인 프로세스 차단 기능 없음 |
| unrelated fake GITHUB_TOKEN | Provider env에서 제외 | 환경변수 allowlist는 작동 |
| 컨테이너 /context 읽기, /tmp 쓰기 | 성공 | 허용 동작 positive control |
| readonly /context 쓰기 | EROFS | 마운트 쓰기 차단 |
| root 밖 쓰기, /tmp/../ 경로 이탈 | EROFS | read-only root 집행 |
| /tmp symlink를 통한 쓰기 이탈 | EROFS | 해당 symlink 반례 차단; 모든 경로 공격 인증 아님 |
| 마운트하지 않은 fake host credential | ENOENT | 제공하지 않은 호스트 경로 접근 불가 |
| container credential env / Docker socket | 없음 | 호스트 자격증명·관리 채널 전달 안 함 |
| effective capabilities / no_new_privs | 0 / 1 | Linux 권한 제한 관측 |
| root remount 시도 | exit 32 | 권한 확대를 통한 readonly 우회 거절 |
| container loopback TCP | 연결 성공 | 네트워크 검사 positive control |
| network=none에서 192.0.2.1:9 | ENETUNREACH | 외부 route 없음, timeout 추정 아님 |
| container /bin/sh 실행 | **성공** | 외부 Sandbox만으로 도구·프로세스 사용을 금지하지 못함 |
| Codex 직접 Adapter 호출 | BLOCKED, launch 0 | 차단 유지 |
| JSONL synthetic completion/tool/reasoning/후행/깨진 JSON | 정상 수용 또는 예상 거절 | 파서 계약만 검증 |

Container 조건은 --network=none, --read-only, --cap-drop=ALL, no-new-privileges, UID/GID 65534, pids-limit=32, memory=128m, cpus=1, /tmp tmpfs noexec/nosuid/nodev, context readonly다. **noexec tmpfs도 이미지 안의 /bin/sh 실행을 막지 않는다.** network=none은 Live 모델 접속도 차단하므로 이 구성을 그대로 Live에 쓸 수 없다. DNS/프록시 allowlist·redirect·IPv6·인증 broker 경로는 미검증이다.

Codex native Windows sandbox는 help만 조사했다. 현재 작업 도구의 sandbox 프로세스 생성이 CreateProcessWithLogonW 1909로 실패해 승인된 소유자 환경에서 진단했다. 이 오류가 대상 Codex CLI에서도 발생한다고 추론하지 않는다. native Sandbox의 계정·방화벽 설치/복구나 전역 설정 변경을 유발할 수 있는 실행은 하지 않았다. native Windows의 파일/네트워크 강제 능력은 이번에 인증하지 않았다.

## 실행 경로 비교

| 경로 | 집행 가능한 정책과 남은 문제 | 비용·OS 호환성 | 판단 |
| --- | --- | --- | --- |
| A. Codex CLI만 | structured output와 shell sandbox 옵션은 존재. 전체 본체/자격증명 격리·모든 도구 금지 입증 없음. JSONL 사후 거절 불충분 | 상대적으로 작지만 버전별 이벤트·정책 검증 필요. native Windows/Linux/macOS를 각각 검증해야 함 | 현 계약으로 NO-GO |
| B. 외부 Sandbox + CLI | 이번 Linux container에서 FS·network·capability 제한 재현. CLI 전체를 감쌀 수 있으나 내부 shell은 가능. no-tool registry/dispatch 집행과 인증/egress 설계 별도 필요 | 높음. Linux 이미지·정책·broker·수명주기·감사 운영 필요. Windows/macOS는 Linux VM 기반 경로; 현재 Windows exe를 Linux image에서 실행할 수 없음 | 조건부 설계 후보, 현재 NO-GO |
| C. 통제된 통합 인터페이스 | CodeFleet이 도구 dispatch를 소유하고 tools 미제공 또는 deny-all하여 실행 자체를 거절. 결과 JSON만 별도 schema 검증. credential은 신뢰된 broker에만 유지 | 중간~높음. 별도 Adapter·인증·비용·취소·schema 계약 검증 필요. host broker는 각 OS에서 검증 | 엄격 PROPOSAL_ONLY에 가장 직접적인 후보, 미구현 |

C의 구체 후보는 도구를 제공하지 않는 구조화 출력 API와 호스트 소유 broker다. 이 경우 Codex CLI/subscription session과 동일 제품·인증·요금이라고 주장할 수 없다. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)는 결과 형태 기능이지 권한 제어 기능이 아니다. 기존 Codex 앱 서버/SDK를 단순 감싼 것만으로 도구를 호스트가 통제한다고 가정해서도 안 된다. 모든 자동 tool dispatch를 거부할 수 있다는 별도 인터페이스 증거가 필요하다.

## 최소 보안 경계와 후속 검증 설계

PROPOSAL_ONLY의 최소 경계는 "모델에는 도구 실행 통로가 없고, 제한된 입력으로 편집 JSON만 제안"이다. Sandbox는 추가 방어이며 이 조건을 대체하지 않는다.

1. 신뢰된 Coordinator가 실행 binary/image digest, 환경, 정책 hash, 버전, 검증 유효기간을 고정한다. 승인된 source/context만 stdin으로 제공하고 host home·repo·Run DB·agent socket을 전달하지 않는다.
2. 도구 등록/dispatch는 host deny-all. 프롬프트·Provider events는 권한을 만들 수 없다. SDK 자동 도구 실행, MCP, plugins, hooks, helper, web/search까지 평가한다. shell child 생성 거절만으로 in-process 파일 접근까지 해결됐다고 주장하지 않는다.
3. 전체 Provider 실행을 제한된 계정/VM/container에 두고 읽기 가능한 경로도 최소화한다. CodeFleet 상태와 계약·정책은 Provider가 수정할 수 없다. 사용자/모델이 임의 config, executable, mount, flags, 환경변수를 덮어쓰지 못한다.
4. 인증은 필요한 Provider에만 전달하며 가능하면 broker 밖에 장기 비밀을 보관한다. 짧은 수명·제한 scope·요청/비용 제한을 검증한다. CLI 인증 방식을 broker로 안전하게 옮길 수 있는지는 별도 조사 대상이다. real HOME 전체 마운트를 대안으로 삼지 않는다.
5. direct network deny와 허용된 모델 endpoint만의 egress 경로를 구성한다. proxy 우회·직접IP·DNS·redirect·IPv6·loopback·unix socket 반례를 검증한다. 모델 endpoint 자체로 전송되는 context는 승인 범위로 제한한다.
6. fresh Capability attestations를 Provider 및 Environment 양쪽에서 필수로 검사한다. version/help나 수동 SUPPORTED 편집으로 활성화하지 않는다. 위 environmentRequired 연결 누락을 향후 구현 범위에 포함한다.
7. 먼저 가짜 모델 서버·가짜 token으로 도구 요청, 악성 context/config, 정책 완화 요청, child process, timeout, coordinator kill, 잔존 process·cost unknown을 검증한다. 그 뒤 별도 승인된 단일 Provider의 최소 Live 계약부터 검증한다. 양쪽 개별 검증 전 병렬 협업 금지.

## 테스트 실행과 제외

| 명령/동작 | 종료 코드 | 결과 |
| --- | --- | --- |
| 최초 기본 sandbox shell | 프로세스 시작 실패 | 1909. 제품 테스트 실패와 구분 |
| 진단 스크립트 최초 | 1 | import 경로 오류; Provider/Docker 검사 시작 전 |
| 진단 스크립트 수정 후 | 0 | 상위 11/11, container 15/15; 반례 확인 포함 |
| node --test test/providers.test.mjs | 0 | 15 통과, 실패·제외 0; [로그](codefleet-g7a-provider-tests.log) |
| native version/help | 각각 0 | 인증/모델 호출 아님; [원문·hash](alpha-g7a-diagnostics.json) |
| npm.cmd run posttest | 0 | coverage·문서 검사, 선언 42개 중 불일치 0; 미앵커 숫자 539개는 기존 baseline과 같음. [로그](codefleet-g7a-docs.log) |

이번에는 제품 소스를 변경하지 않아 npm test 전체·Doctor·Node/Maven/JDK 전체·G6 E2E를 재실행하지 않았다. G6의 449개 성공은 이전 실행 근거로만 남는다. native Windows sandbox, 실제 Provider enforcement, Live JSONL, 실제 의미 분석·청구·협업은 미실행이다. 이번의 container Node 보안 payload를 Codex/Claude 실행 검증으로 부르지 않는다.

## 결론

G7-A의 분석과 오프라인 재현은 완료했다. 외부 Sandbox의 일부 강제 기능은 관측했지만 no-tool·인증·Live egress 경계는 충족되지 않았다.
**지금 실제 Live 호출을 진행하면 안 된다.** 보안 집행 경로 구현·반증·환경 Capability 연결 및 사용자 모델/비용 승인이 먼저 필요하다.
제품 소스·테스트 기준·차단은 유지했고 커밋·푸시·배포하지 않았다.

- 다음 작업: B 또는 C의 구체 구현 범위를 별도 승인받아 fake transport 기반 보안 집행부터 검증. Claude 기존 V1과 신규 strict 경로는 분리해 평가.
- 미해소로 남긴 것: Codex no-tool 실행 경로, 전체 프로세스 credential/egress 격리, 환경 attestation 필수 연결, 실제 Provider/OS별 호환성·출력·취소·청구 검증.
