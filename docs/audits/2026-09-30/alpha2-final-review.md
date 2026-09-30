# alpha.2 최종 코드 검토: 변경 요청

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-09-30 KST |
| 대상 커밋 해시 | `12a7e7afff0342021d3e5f61e1e9ac4ebd1e4cbf` |
| 작업 유형 | 코드 검토·재현 |
| 선행 문서 | [품질 수정](../../runs/2026-09-30/alpha-quality-remediation.md), [이전 감사](alpha-quality-gate.md) |
| 번호 실측 최대값 | 기존 P0-17 / P1-61, 알파 AQ-01~03 이후 별도 식별자 |

## AQ-04 — P1: 실패한 resume이 실행 중 worker의 취소를 해제

근거: `src/alpha/cli.mjs:55`, `src/alpha/cli.mjs:56`, `src/alpha/cli.mjs:62`.

resume은 worker 소유권을 얻기 전에 control을 run으로 바꾼다. 활성 lease가 있는 GENERATING 실행에 cancel 후 resume을 호출하면 resume은 Run already has an active worker로 exit 1이지만 control은 이미 run이다. worker가 cancel을 아직 관측하지 못했다면 취소를 잃고 모델/검증/전달을 계속할 수 있다. 두 번째 worker가 실제로 생성돼야 발생하는 문제가 아니다.

실제 CLI subprocess와 SQLite lease로 재현했다. 별도로 idle WAITING_HUMAN 실행을 취소해도 상태는 CANCELLED가 되지 않아 resume의 금지 조건을 통과하고 control을 run으로 되돌리는 것을 확인했다. idle 예제에는 모델 호출 방지를 위해 소진된 시간 예산을 사용했다; 실제 모델 재호출은 하지 않았다.

수정 방향: 취소의 terminal 전이를 저장소에서 일관되게 처리하고, resume의 소유권 획득과 control 전이를 원자적으로 수행한다. 실패한 resume은 control을 변경하지 않아야 한다. 원격 효과가 불명확한 취소는 쓰기 중단과 읽기 전용 재조정을 분리한다.

## AQ-05 — P1: 실행 시간 소진 후 PR 효과 재조정이 영구 차단

근거: `src/alpha/controller.mjs:34`, `src/alpha/controller.mjs:38`.

execute는 RECONCILING 분기보다 먼저 시간 budget guard를 실행한다. PR 생성 응답이 유실되면서 실행 예산이 소진되면, 이후 resume도 동일한 guard에서 멈추므로 이미 생성됐을 수 있는 PR을 조회할 수 없다. 상태는 RECONCILING에 남고 시간은 복구되지 않는다.

유효한 수락·검증 아티팩트가 있는 RECONCILING 실행, elapsedMs 30000, timeoutSeconds 30을 저장하고 deliver를 계측했다. 결과는 RECONCILING / Total execution time budget exhausted, remoteLookups 0이었다. 원격 API는 모의 함수이며 실제 PR이나 네트워크 요청은 만들지 않았다.

수정 방향: 새 모델/원격 쓰기 예산과 읽기 전용 reconciliation 예산을 분리한다. 전체 예산을 단순 초기화해 추가 모델 호출이나 중복 쓰기를 허용해서는 안 된다.

## AQ-06 — P2: base 이동 시 기존 PR 조회도 거부

근거: `src/alpha/delivery.mjs:20`, `src/alpha/delivery.mjs:21`, `src/alpha/delivery.mjs:22`.

base SHA 확인이 결정적 브랜치와 기존 PR 조회보다 앞선다. PR 생성 후 응답을 잃고 main에 다른 커밋이 들어오면 기존 PR의 결과를 확인하는 대신 새 실행을 요구한다. 이전 PR이 이미 생성됐는지 확인하지 않은 채 새 실행을 만들면 서로 다른 run ID의 중복 제안이 생길 수 있다.

base가 이동한 API 응답을 주입했을 때 호출은 base 조회 1회뿐이고 기존 branch/PR 조회에는 도달하지 않았다. 새 쓰기에 대한 base drift 거부는 유지해야 한다. 현재 사용 설명서에도 base 이동 시 새 실행을 요구하므로 이를 숨겨진 정책 변경으로 보지는 않는다. 다만 기존 효과를 재조정하는 제품 기능에는 분명한 제한이므로 P2 개선 항목으로 분리한다.

수정 방향: 기존 효과는 고정된 원래 base·candidate·evidence와 대조해 조회하고, 새로운 쓰기를 수행할 때 현재 base를 검사한다.

## 검증 범위

알파 controller, verifier, guard, CLI, delivery, process, store의 제어·상태 전이를 검토했다. 기존 알파 테스트 20개는 다시 실행해 모두 통과했다. 추가 재현 스크립트 `node scripts/alpha-final-review.mjs`는 4개 시나리오에서 위 문제를 재현하고 exit 2를 반환했다. 모델·Docker·실제 원격 쓰기는 이번 재현에 사용하지 않았다. 기존 전체 324개 스위트를 이번 검토에서 다시 실행했다고 주장하지 않는다.

기존 AQ-01~03의 수정 효과를 부정하는 결과는 아니다. 이번 항목은 취소·전달 재조정의 다른 경계다. 임의의 적대적 JS에 대한 범용 검증 보증은 기존 문서대로 지원 범위 밖이며 새로운 결함으로 중복 등재하지 않는다.

## 결론

최종 승인 대신 변경 요청이다. P1 두 항목과 P2 한 항목을 기록했다. 런타임과 공개 릴리스는 이번 검토에서 변경하지 않았다.

## 다음 작업

취소 상태와 resume 원자성, 예산 소진 후 읽기 전용 효과 조회를 우선 수정하고 CLI 경합·시간 경계 회귀 테스트를 추가한다. 기존 PR 조회와 새 쓰기의 base 정책을 분리 검토한다.

## 미확인으로 닫힌 것

실제 GitHub의 네트워크 장애와 base 이동을 동시에 발생시키는 통합 실험, 모든 OS의 취소 타이밍, 전체 보안 감사는 미확인이다.
