# 취소·재개 원자성과 읽기 전용 PR 복구

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-09-30 KST |
| 대상 커밋 해시 | `d462503`에서 시작한 변경 |
| 작업 유형 | 수정·검증 |
| 선행 문서 | [최종 코드 검토](../../audits/2026-09-30/alpha2-final-review.md), [진행 현황](../../product-completion/progress.md) |
| 번호 실측 최대값 | 기존 P0-17 / P1-61, 알파 AQ-04~06 별도 추적 |

## 변경 전 점검

진행 현황 문서의 decision-debt 점검: 최종 차단 카드 없음, 후보 하나는 내부 근거 부족으로 제외. 사용자가 최종 검토의 결함 해결을 승인했다. 이번 변경은 기존 재현 사례와 그 회귀 경계에 한정했다.

## AQ-04: 취소와 재개

resume의 control 변경을 CLI에서 제거하고 SQLite의 worker claim 트랜잭션으로 옮겼다. 활성 worker 존재 확인과 취소 상태 검사, control 전이, lease 획득, 감사 이벤트가 함께 커밋되거나 함께 롤백된다. 실패한 resume은 cancel/pause를 해제하지 않는다. 취소는 terminal 상태로 기록하며 일반 실행으로 되돌릴 수 없다.

이미 전달 의도가 저장된 작업은 취소해도 RECONCILING으로 보존한다. resume은 cancel을 해제하지 않고 읽기 전용으로 기존 원격 효과만 확인한다. 조회 성공의 COMPLETED는 기존 전달 확인을 의미하며 취소 후 새 작업이 실행됐다는 의미가 아니다. 원격 효과를 자동 삭제하지 않는다.

## AQ-05: 실행 예산 소진과 조회 예산 분리

RECONCILING은 모델/검증 실행의 시간 예산 검사보다 먼저 별도 조회 경로를 따른다. 조회에는 호출당 최대 30초, 해당 재조정 전체에는 60초 deadline을 적용한다. 각 요청에 남은 시간을 전달한다. 예산이 소진됐거나 취소 상태라면 모든 원격 쓰기를 거부한다. 기존 PR이 없거나 증거가 불일치하면 RECONCILING에 남겨 수동 확인을 요구하며 새 모델·branch·PR을 생성하지 않는다.

## AQ-06: 기존 효과와 새 쓰기의 base 조건 분리

결정적 run branch 및 기존 PR을 먼저 조회하고 고정된 원래 base·commit marker·파일 내용·변경 범위를 대조한다. main이 이동해도 일치하는 기존 PR은 재조정한다. PR 병합 후 head branch가 삭제돼도 PR head commit을 대조할 수 있다. 새 branch/PR 생성 시에는 현재 base가 검증 기준과 같은지 다시 확인한다.

## 검증 결과

- 전체 `npm test` 종료 코드 0: 기존 324건, 알파 25건, 문서·커버리지 검사 통과.
- 실제 CLI와 SQLite에서 활성 worker 취소 후 실패한 resume의 control 보존, idle 취소의 terminal 상태, 트랜잭션 실패 시 lease/control 롤백 확인.
- 시간 예산 소진 후 조회 허용, 취소 후 cancel 유지 조회, read-only에서 PR/branch 누락 시 쓰기 0건, base 이동·branch 삭제 후 기존 PR 대조를 자동 테스트로 검증.
- `node scripts/alpha-final-review.mjs` 종료 코드 0: 이전 네 재현 시나리오의 defectReproduced 모두 false. 이 스크립트를 Linux CI에 추가했다.
- 실제 GitHub [검증 PR](https://github.com/solzip/CodeFleet/pull/2)을 보존된 로컬 accepted artifact와 대조했다. 결과 reconciled true, commit `f9fe8e423bd53d7459278b8e26028df82a111daa`. read-only 옵션과 모든 쓰기 체크포인트 거부를 함께 적용했고 새 PR·branch·모델 호출은 없었다.

## 결론

AQ-04~06의 재현 조건을 수정하고 회귀 검증했다. 기존 알파의 테스트 의미·적대적 JS·외부 파일럿 한계는 그대로이며 범용 무인 운영 완료로 확대 해석하지 않는다.

## 다음 작업

최신 CI와 새 버전 설치 패키지 검증 후 alpha.3를 배포한다. 공개 태그 alpha.1/alpha.2의 파일을 덮어쓰지 않는다. 사용자 작업에서 개입 시간과 수락 품질을 측정한다.

## 미확인으로 닫힌 것

실제 GitHub에서 응답 유실·main 이동·branch 삭제를 동시에 유발하는 전체 장애 실험은 미수행이다. 그 조합은 모의 API로, 실제 원격 내용 대조는 기존 PR의 읽기 전용 호출로 각각 검증했다.
