# 공개 알파 다운로드부터 실제 모델 실행까지

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-09-30 KST |
| 대상 커밋 해시 | `54f0a9014d350233c638376654fbcf1acd51d534` |
| 작업 유형 | 실행·검증 |
| 선행 문서 | [MIT 배포 기록](mit-public-alpha.md), [설치 안내](../../product-completion/alpha-quickstart.md) |
| 번호 실측 최대값 | P0-17 / P1-61, 신규 등재 없음 |

## 범위와 입력

사용자가 직접 테스트를 요청했다. 로컬 소스 재패킹 대신 공개 GitHub Release의 `v0.2.0-alpha.1` tarball과 SHA256SUMS를 다운로드했다. SHA-256은 `de5e58b1b129e3a8fe84777a7a7b046b767b369ed082e345ac8d2d48ced0a6e2`로 일치했다. 빈 임시 설치 디렉터리에서 offline npm install 후 설치된 `codefleet-alpha` 명령을 npx --no-install로 사용했다.

시험 저장소는 별도로 만든 공개 가능한 fixture다. `src/math.js`의 subtract가 잘못된 덧셈을 반환하고, Node 테스트 하나가 양수 결과와 음수 결과를 단언한다. 작업 계약은 해당 소스만 수정 허용, 최대 시도 2회, 총 300초, 시도당 공급자 예산 $1, local 전달이다. 원본 fixture를 만들기 위한 코드는 시험 준비이며 실제 수정안은 Claude가 생성했다.

## 환경과 장애

Windows, Node v24.14.1, Git 2.42.0.windows.2, Claude CLI 2.1.285, GitHub CLI 2.87.3을 관측했다. 최초 sandbox doctor는 Docker 설정 접근 거부로 exit 1이었다. 승인된 정상 사용자 실행에서는 doctor의 모든 점검이 성공했다.

그 뒤 sandbox 계정이 생성한 fixture의 Git 소유권이 정상 사용자와 달라 첫 run은 exit 1로 거부됐다. 전역 safe.directory를 완화하지 않고 정상 사용자 소유의 새 fixture를 만들어 해결했다. 이 두 실패에서는 모델 수정 작업이 시작되지 않았다. 환경 준비와 수동 복구 시간은 별도 계측하지 않았으므로 아래 실행 시간을 전체 업무 소요 시간으로 해석하지 않는다.

## 실제 실행 결과

- Run ID: `397cd29e-0e69-4119-aafa-7a286e4ed92b`.
- `run` 종료 코드 0, 상태 COMPLETED, 모델 시도 1회, 실행 기록 elapsedMs 7434.
- 공급자 보고 비용 $0.0100722, unknownCostAttempts 0. 독립적인 청구 검증은 아니다.
- 기준선: 보호된 테스트 1개 실행, 실패 1개, exit 1.
- 제안 결과: `export const subtract = (a, b) => a - b;`.
- 수정 후 Docker: 테스트 1개, 통과 1개, 실패·skip·todo 0개, exit 0, interrupted false, truncated false, integrity true.
- 원본 저장소 git status --porcelain 출력 없음. 원본은 여전히 `a + b`이며 테스트·소스가 덮어써지지 않았다.
- `status`와 `export` 종료 코드 0. verified-change.json에 수정 파일이 `src/math.js` 하나이며 verification.json의 candidateHash와 일치했다.
- 테스트용 npm uninstall 종료 코드 0, 설치 경로의 codefleet 패키지 제거 확인. 상태·내보내기 증거는 로컬에 보존했다.

기준선 아티팩트: `2d16156ac4d434f30cdfd726d245a53f8acf67b2ed2c325db97dfd6d82883e59`.
최종 증거: `8047377c5ce173c79667e569eba64e27c3739a50e43f5157c02911a2c433a59e`.
후보 해시: `1e568e71056e8ad38d4002b37d1245e42a7f1a17c39ca0ea7a3f69cbfaf9b62c`.

## 결론

공개 배포 패키지로 설치→환경 진단→실제 Claude 수정→Docker 검증→조회·내보내기→제거 경로를 확인했다. 실행 도중 사람의 편집이나 승인은 없었다. 환경 준비에는 두 차례 복구가 필요했다.

## 다음 작업

실제 사용자 작업에서 준비·개입·검토·복구 시간을 포함해 측정한다. 이번에는 원격 PR을 추가 생성하지 않았으며 이전 PR 전달 검증과 구분한다.

## 미확인으로 닫힌 것

외부 사용자 파일럿, 실제 프로젝트의 생산성 향상, 신규 OS의 전체 실행은 미확인이다. 단순 fixture 자체 실행을 외부 실적으로 집계하지 않는다.
