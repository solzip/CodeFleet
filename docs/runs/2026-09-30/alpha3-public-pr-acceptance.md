# 공개 alpha.3 패키지의 PR 전달과 취소 후 재조회

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-09-30 KST |
| 대상 커밋 해시 | `d966a1a9811209ecb46446fe95c4d39601e38114` |
| 작업 유형 | 공개 배포본 실행·검증 |
| 선행 문서 | [취소·재조정 수정](alpha-reconciliation-fixes.md), [진행 현황](../../product-completion/progress.md) |
| 번호 실측 최대값 | 기존 P0-17 / P1-61, 신규 결함 등재 없음 |

## 입력과 검증 경계

GitHub Release에서 공개된 `codefleet-0.2.0-alpha.3.tgz`와 SHA256SUMS를 새 경로로 다운로드했다. SHA-256 `6559e99953a2afc8fb13f72d7bf071a380f69727676b17300f5a206a0b7ceada` 일치를 확인하고 빈 디렉터리에 설치했다. 개발 작업 트리의 실행기를 쓰지 않고 설치된 `npx --no-install codefleet-alpha`를 사용했다.

테스트 저장소는 기존 `alpha/acceptance-baseline`의 별도 clone이다. 기존 뺄셈 fixture의 실패 테스트를 고치도록 `src/alpha-sample.js` 하나만 수정 허용했다. 회사의 실제 업무나 외부 사용자 실적이 아닌 자체 acceptance 실행이다. main 대상 PR이나 자동 병합을 수행하지 않았다.

## 실제 완료 결과

- 설치·doctor 종료 코드 0. Windows Node v24.14.1, Claude CLI 2.1.285, Docker 검증 환경 확인.
- run `cc44ffc7-f6b0-42d4-806d-c7e284dff4fb`: COMPLETED, 모델 시도 1회, elapsedMs 29279.
- 공급자 보고 비용 $0.0104642. 독립적인 청구 금액 검증은 아니다.
- 기준선 테스트 1개 실패, 후보 테스트 1개 통과. 최종 integrity와 testIdentityMatch 모두 true.
- 실제 [draft PR #4](https://github.com/solzip/CodeFleet/pull/4), base `alpha/acceptance-baseline`, head `codefleet/cc44ffc7-f6b0-42d4-806d-c7e284dff4fb`.
- 변경 파일 `src/alpha-sample.js` 하나. commit `2cd26a3ee06fb22a7e185a150e3e524e58cb19f0`. 공개 author는 `sol <solarchive.dev@gmail.com>`.
- 원본 clone의 git status --porcelain 출력 없음. export의 변경 파일 역시 허용 소스 하나였다.

## 설치된 CLI의 원격 복구

원본 완료 상태는 보존하고 상태 디렉터리를 별도로 복사했다. 복사본에만 RECONCILING, 소진된 실행 시간, cancel을 설정했다. 이것은 저장 상태를 주입한 복구 시나리오이며 실제 네트워크 응답 유실을 일으킨 실험이 아니다.

설치된 CLI의 resume 결과는 COMPLETED, control cancel 유지, reconciled true, 기존 PR URL 일치였다. 시도 수는 1회, 보고 비용도 동일해 모델 재호출이 없었다. 별도로 원본 완료 실행에 resume을 호출해도 같은 전달 결과와 시도 수를 유지했다. 공개 GitHub상의 PR 내용과 커밋 신원도 조회해 확인했다.

status·export·npm uninstall까지 완료했다. 패키지 제거 후 설치 경로의 codefleet 폴더가 없음을 확인했고, 상태와 증거는 로컬에 보존했다. 공개 로그에는 계정의 로컬 경로와 인증 정보를 포함하지 않는다.

## 결론

공개 alpha.3 배포본으로 설치→모델 수정→Docker 검증→draft PR→예산 소진·취소 후 같은 PR 재조회→내보내기→제거 경로를 확인했다. 이번 검증에서 새 결함을 관측하지 않았다. 외부 사용자 파일럿 완료를 의미하지 않는다.

## 다음 작업

독립 사용자에게 지원 범위 안의 작업을 수행하게 하고 준비·개입·검토·복구 시간과 결과 품질을 수집한다. 검증용 PR은 acceptance 전용으로 보존하며 구현 PR과 혼동하지 않는다.

## 미확인으로 닫힌 것

외부 사용자 실적, 실제 네트워크 장애 동시 발생, 업무 생산성 개선은 미확인이다. 동일한 자체 fixture 반복을 신규 사용자 성과로 집계하지 않는다.
