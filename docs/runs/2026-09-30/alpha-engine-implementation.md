# 제한된 알파 실행 경로 구현과 실측

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-09-30 KST |
| 대상 커밋 해시 | `c89c2f8bdaddbaaa8a20ee47031b73605681c711`에서 시작한 작업 트리 |
| 작업 유형 | 구현·실행·검증 |
| 선행 문서 | `docs/product-completion/architecture.md`, `docs/product-completion/roadmap.md`, `docs/product-completion/progress.md` |
| 번호 실측 최대값 | 기존 P0-17 / P1-61. 기존 결함 등재부 변경 없음 |

## 범위 결정

사용자는 로드맵에 따라 공개 알파·파일럿까지 진행하도록 지시했다. 먼저 기존 전체 스위트를 실행하고 실제 제품 소스를 복제해 기존 작업 흐름의 실패를 재현했다. 그 뒤 **기존 실패 테스트가 있는 작은 Node 작업**을 처리하는 별도 alpha 경로를 구현했다.

새 경로는 명시한 파일의 도구 없는 편집 제안 → 하네스의 scope·원문 일치 검사 → 네트워크 없는 Docker 검증 → 제한된 재시도·예외 → 로컬 산출물 또는 draft PR이다. 일반 에이전트의 명령을 모두 관측한다고 주장하지 않는다. 임의 빌드, 자동 테스트 설계, 다중 작업 큐, 자동 병합·배포는 이번 구현에 포함하지 않았다.

## M0 기준선

- Node v24.14.1, Git 2.42.0.windows.2, Claude CLI 2.1.285, Docker 엔진 24.0.6에서 조사했다. Docker 검증 이미지 digest는 코드의 `IMAGE` 상수로 고정했다.
- 최초 `npm test`: exit 0, 기존 324 통과. 문서·coverage 후처리 포함.
- `scripts/m0-baseline.mjs`: 실제 저장소를 임시 복제해 init·task validate 성공. 개발자 역할의 검증 명령 포함 task approve는 exit 1, `apply --check`도 exit 1로 재현했다. 승인 단계에서 막혔으므로 에이전트 실행 성공으로 기록하지 않았다.
- 설계에서 역할과 명령 실행의 결합을 우회하지 않고, 새 경로에서는 모델에 실행 권한을 주지 않는 방식으로 분리했다.

## 구현 위치

| 위치 | 책임 |
| --- | --- |
| `src/alpha/contract.mjs` | 계약·경로·편집 검증과 순수 판정 |
| `src/alpha/process.mjs` | 제한 환경·출력·시간·취소·프로세스 종료 |
| `src/alpha/store.mjs` | SQLite 상태·이벤트·lease·해시 산출물·schema version |
| `src/alpha/workspace.mjs` | 기준 commit의 정규 파일 snapshot·맥락 manifest·candidate 해시 |
| `src/alpha/provider.mjs` | 명시적 context만 보내는 도구 없는 Claude 제안 |
| `src/alpha/verifier.mjs` | 읽기 전용·무네트워크·비특권 Docker 검증과 컨테이너 자체 제한 시간 |
| `src/alpha/controller.mjs` | 사전 실패 테스트, 시도 예약, 복구, 검증, 영속 PR intent |
| `src/alpha/delivery.mjs` | 명시한 원격으로만 draft PR 전달·기존 효과 내용 확인 |
| `src/alpha/cli.mjs` | doctor/run/status/pause/resume/cancel/export |

## 실제 실행 증거

### 현재 제품 소스의 결함 수정

`node scripts/alpha-smoke.mjs --real-provider`: exit 0.

- 실행 ID: `ff877204-af0d-4738-a32f-cd9b11db644d`.
- 실제 CodeFleet 소스에 `apply --check` 회귀 테스트를 추가한 통제된 복제본 사용.
- 수정 전 Docker 검증: 테스트 1건, 실패 1건, exit 1. 원인은 `Unknown option for review: --check`.
- 실제 Claude 제안 1회 후 Docker 검증: 테스트 1건, 성공 1건, exit 0.
- 실행 제어 구간 약 24초, 공급자 보고 비용 약 0.141 USD. 독립 청구 검증 아님.
- candidate hash: `cb7679499513f046fd073aa461bda8bbdaeef60b4516f2dea4b49d0e28bd9943`.
- accepted artifact hash: `f28a46f971bc3583721310e7e3307932b6ff48ae2edbfab769e8a599ea4abd33`.
- 원본 작업 저장소는 수정하지 않았다. 이 결과는 회귀 테스트 한 건의 성공이며 전체 제품 기능 보증이 아니다.

### 실제 PR 전달

`node scripts/alpha-delivery-smoke.mjs --remote-acceptance`: exit 0.

- 대상: `solzip/CodeFleet`의 전용 `alpha/acceptance-baseline` 브랜치. main은 변경하지 않았다.
- 실행 ID: `21522e48-d17a-4964-bfac-7232e8ad4f58`.
- Claude 제안·Docker 검증 후 [draft PR #2](https://github.com/solzip/CodeFleet/pull/2) 생성. 재조회에서 같은 PR을 확인했고 `reconciled: true`, 추가 PR 생성 없음.
- 공급자 보고 비용 약 0.0106 USD.
- 최초 전달 코드가 API 기본 작성자 정보를 사용한 것을 사후 확인했다. 전달 계약에 공개 authorName/authorEmail을 필수로 추가하고, 전용 검증 브랜치의 동일 내용 커밋을 `sol` 신원으로 교체했다. 정정 head는 `f9fe8e423bd53d7459278b8e26028df82a111daa`다. 원격의 이전 객체가 즉시 삭제됐다고 주장하지 않는다.
- 이 PR은 격리된 전달 검증용이며 제품 릴리스나 외부 사용자 실적이 아니다.

## 실패·복구 검증

알파 테스트는 scope 이탈, 검사 누락·0건·skip, stdout 초과, 실제 timeout 종료, 기존 성공 baseline 재개 우회, 반복 제안·예산 소진, 증거 변조, 동시 worker, pause/cancel, worker 프로세스 사망 후 시도 예산 보존, PR 응답 유실 후 내용 재검증·중복 방지를 포함한다.

최종 로컬 `npm test`: exit 0. 기존 스위트 324 통과, 알파 스위트 14 통과, 문서·coverage 후처리 통과. 이는 실행한 로컬 환경의 결과다.

`node scripts/alpha-verifier-smoke.mjs`: exit 0. 실제 컨테이너에서 호스트 비밀값 미전달·외부 네트워크 인터페이스 없음·소스 쓰기 차단 확인. 잘못된 테스트는 exit 1, 무한 대기는 interrupted로 처리했다. 컨테이너 내부에도 별도 timeout을 두어 호스트 controller 사망 시 무기한 실행을 방지한다.

전체 `npm test`는 기존 테스트와 알파 테스트를 각각 실행한다. 기존 TAP 기록은 아카이브 엔진 통계용으로 유지하고 신규 테스트를 기존 설계 coverage로 합산하지 않는다. 명시적 `*.test.ts` 선택에서 helper 파일 단위 결과가 빠져 기존 통계가 321로 바뀌는 것을 발견해 기존 탐색 범위인 `test/*.ts`로 복원했다. 검사 기준을 낮추지 않았다.

## 배포 준비와 남은 게이트

로컬 `npm pack --ignore-scripts`로 후보 패키지를 만들고 빈 디렉터리에서 offline install·`codefleet-alpha --help`·uninstall 모두 exit 0을 확인했다. 최종 변경 이후의 패키지는 재생성해야 한다. 패키지 게시나 공개 사용 릴리스는 수행하지 않았다.

CI는 Windows 전체 검사·패키지 설치, Linux 알파 테스트·실제 컨테이너 경계 검증으로 나눴다. [checkout](https://github.com/actions/checkout)과 [setup-node](https://github.com/actions/setup-node)의 공식 안내·태그를 확인하고 action commit을 고정했다. 최초 구현 커밋 `22d3c03`의 [원격 CI](https://github.com/solzip/CodeFleet/actions/runs/36672858564)는 두 job 모두 success였다. 후속 변경의 최종 CI는 구현 PR의 최신 checks가 기준이다.

추가로 `npm run alpha:package-smoke -- --real-provider`를 실행해 tarball을 빈 디렉터리에 설치한 후 **설치된 CLI로** 실제 모델·Docker 작업을 완주했다. 실행 ID `3c477256-8137-4938-8b7c-cca59ee59a15`, 시도 1회, 공급자 보고 비용 약 0.0105 USD. install/help/workflow/uninstall 모두 성공했다. 이 자체 검증은 외부 사용자 실적이 아니다. 이때 패키지 파일 수는 134개였으며 문서 추가 이후 최종 후보는 다시 패키징한다.

라이선스 선택과 파일럿 참여자 확보를 사용자에게 질문했으며 아직 답변을 받지 않았다. [설치 안내](../../product-completion/alpha-quickstart.md)와 [파일럿 패킷](../../product-completion/pilot.md)은 준비했다. 사용 불가 LICENSE를 유지한 채 공개 사용 가능하다고 표시하지 않는다.

## 결론

제한된 알파 경로에서 실제 모델 수정·독립 검증·draft PR 전달까지 관측했다.
로컬 테스트·패키지 준비와 공개 알파·실제 외부 파일럿을 구분한다.
공개 사용은 라이선스 결정과 남은 출시 검증 후 가능하다.

## 다음 작업

최종 검사와 원격 CI 확인, 공개 라이선스 확정, 패키지 후보 재생성, 외부 파일럿 모집·측정.

## 미해소로 남긴 것

일반 개발 업무 전체·자동 작업 분해·팀 사용·자동 병합·배포는 후속 범위다. 라이선스와 실제 파일럿 사용 기록은 미확보다.
