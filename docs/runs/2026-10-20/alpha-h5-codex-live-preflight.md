# H5 — 승인된 Codex 최소 Live의 실행 전 차단

작업일: 2026-10-20 (Asia/Seoul). 대상 HEAD: `81144a6dedb7e73b41b0029d14161943bffdfaeb`. 유형: 실행 전 감사·차단 결정. 선행: [H5 오프라인 수용 기록](alpha-h5-host-acceptance.md). 결함 번호의 선행 실측 최대값 P0-17/P1-61; 신규 번호 없음.

## 결론

**BLOCKED — 실행 전 필수 조건 3·4의 기술적 집행을 입증하지 못해 모델을 호출하지 않았다.** 사용자 승인은 유효하게 받았지만 승인 자체가 격리 증거를 대신하지 않는다. 이 결과는 실행 후 실패나 PARTIALLY_VERIFIED가 아니다. CodeFleet 전체 제품과 이 제한 테스트 모두 HOST_LIVE_VERIFIED가 아니다.

승인 범위는 새 임시 Git 저장소의 공개 fixture에서 Codex Skill 호출 최대 1회, 읽기·분석·구조화 제안뿐이다. 파일 수정, shell/외부 도구, 하위 Agent, Operator/Harness, 비공개 문맥 전송, 직접 API/Key, Git 쓰기 및 추가 Live 호출은 금지다. 이 금지는 시험 대상 모델에 적용하며, 본 감사의 로컬 help·스키마 추출·문서 기록은 모델 실행이 아니다.

기존 worktree와 `feature/alpha-g0-refresh`, 누적 H5 문서 변경 및 `.trials/`를 보존했다. 이번에 제품 소스·테스트·정책·전역 설정·인증 파일을 수정하지 않았다. 새 실행 fixture, baseline commit, 모델 세션도 만들지 않았다.

## 실제 확인과 한계

| 확인 | 결과 | 의미 |
| --- | --- | --- |
| `codex.cmd --version` | exit 0, codex-cli 0.162.1 | 설치 버전 재확인 |
| `codex.cmd app-server --help` | exit 0 | 로컬 확장 명령 확인 |
| `codex.cmd exec --help` | exit 0 | sandbox 설명은 model-generated shell commands 대상 |
| `codex.cmd app-server generate-json-schema --help` | exit 0 | 모델 없이 스키마 추출 가능 |
| `codex.cmd app-server generate-json-schema --experimental --out <ignored-checkpoint>` | exit 0 | 현재 binary의 프로토콜 추출 |
| `codex.cmd features list` | exit 0 | shell_tool, apps, browser_use, multi_agent, hooks 활성 |
| Skill 지원 | 선행 H5 실제 skills/list의 1→0→1, 모델 turn 0 | 동일 버전의 발견 증거 재사용; 이번에 실제 Skill 호출하지 않음 |

추출한 ThreadStartParams/TurnStartParams 두 스키마를 확인했다. sandbox/permissions와 확장 config가 존재하지만 모든 내장·외부 도구를 일괄 차단한다는 명시적 필드는 확인하지 못했다. dynamicTools의 빈 목록은 내장 도구 제거의 증거가 아니다. 임의 config 필드를 받을 수 있다는 사실도 집행 성공을 뜻하지 않는다. 이 조사는 다른 모든 방법이 불가능하다는 주장이 아니다.

공식 [Permissions](https://learn.chatgpt.com/docs/permissions)는 read-only에서도 로컬 명령 실행을 설명한다. 제한된 파일시스템 profile도 제공하지만 이 설치에서 fixture 전용 경계의 실제 적용과 우회 거절을 검증하지 않았다. [Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)는 shell_tool, 앱별 설정 등 개별 제어를 구분한다. [App Server](https://learn.chatgpt.com/docs/app-server)는 dynamicTools를 추가 도구 인터페이스로 설명한다. 문서의 기능 존재를 현재 세션의 보안 집행 성공으로 승격하지 않는다.

현재 작업 세션에는 실제 프로젝트 문맥과 도구 권한이 있으므로 이를 시험 세션으로 그대로 사용할 수 없다. 기존 세션 resume/fork는 비공개 문맥 혼입을 막는 경계도 아니다. 새 세션의 실제 유효 도구 집합, hook/connector/내장 파일 접근, 모든 자식 프로세스, fixture 외 읽기를 함께 차단하는 검증된 구성은 확보하지 못했다. 승인 요청을 거부하는 client만으로 sandbox 안에서 이미 허용된 명령까지 차단된다고 가정하지 않았다.

decision-debt는 이번 사용자 승인 지시의 범위 발췌 1건을 keyless 검사했다. 최종 카드 0, 독립 내부 근거 부족으로 제외 1, 경고 0이었다. 기록 원문 전체나 저장소 전체 감사가 아니며 기술적 차단 해제 근거도 아니다.

## 호출 및 실행 결과

| 항목 | 관측 |
| --- | --- |
| 승인된 Codex Live Skill 호출 | 0회 / 최대 1회 |
| 모델 실행 명령, thread/start, turn/start | 호출하지 않음 |
| 입력 확정·전송 | 보안 gate에서 중단; 전송 없음 |
| 시험 모델·세션 ID | 생성/선정하지 않음 |
| Task Draft·수정 제안 | 생성되지 않음 |
| 시험 모델의 도구·Agent 실행 | 시험 모델 자체가 시작되지 않음 |
| 시험 모델의 파일 수정 | 시험 모델 자체가 시작되지 않음; 실제 세션의 무수정 검증으로 주장하지 않음 |
| 사용량·비용 | 이 시험의 요청 없음; Host 과금 원장 조회는 하지 않아 금액을 측정값으로 기록하지 않음 |
| 독립 Harness/Judge | 호출하지 않음; 검증 성공 없음 |

전체 회귀 522건과 Doctor 통과는 선행 H5 결과다. 이번 문서·CLI 조사에서 재실행했다고 주장하지 않는다. 준비용 스키마와 기능 목록은 ignored checkpoint에 보관했고 공개 [증거](alpha-h5-codex-live-preflight-evidence.json)에는 스키마 hash와 필드명, 명령 결과만 남겼다.

기록 작성 후 `check-links.mjs`, `check-doc-citations.mjs`, `check-doc-facts.mjs`는 각각 exit 0이었다. 초기 sandbox 내 링크·사실 검사는 내부 Git exit 128로 실패했고 정상 Git 접근 환경에서 재실행했다. 선언 사실 42개 불일치 0, living 문서 숫자 581개 중 미검사 539개로 검사 범위를 한정한다. 보안 조건이나 테스트를 완화해 해결하지 않았다. 기록·증거 및 색인/진행 현황만 갱신했고 커밋·푸시하지 않았다.

## 다음 작업

모델 없이 별도 수용 환경에서 no-tool 및 fixture 전용 읽기 경계를 먼저 구현·반증해야 한다. 실제 유효 도구 집합과 hook/connector 비활성화, fixture 밖 읽기·쓰기·하위 프로세스 거절을 관측할 수 있어야 한다. 기존 Host 인증정보를 임의 복사하거나 직접 API로 우회하지 않는다. 이번 제한 테스트 요청을 대형 격리 구현 승인으로 확대하지 않으며 자동 재시도하지 않는다.

## 미해소로 남긴 것

전 도구 차단과 fixture 외 접근 제한, 실제 Skill 호출, 구조화 제안, 모델/세션 사용량, 실제 Host의 무수정·무도구 실행 증거. 추가 승인을 반복 요청해도 기술적 차단은 해소되지 않는다.
