# TeamBuilder 2.0.1

참가자를 그룹으로 배정하는 정적 웹 앱입니다. HTML/CSS/JavaScript만 사용하며 서버·DB·빌드 과정 없이 실행합니다.

## 실행

저장소 폴더를 정적 웹 서버로 제공하거나 GitHub Pages 같은 정적 호스팅에 올립니다. 로컬 확인에는 다음 명령을 사용할 수 있습니다.

```sh
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다. 명단·그룹 수와 필요한 규칙을 입력하고 **생성**을 누릅니다. 그룹별 정원, 함께·분리·고정 배정, 속성 균형과 역할 필수·선택·제한·선호도를 지원합니다. 같은 시드·설정과 충분한 탐색 예산으로 결과를 재현할 수 있습니다.

## 2.0.1 안정화

- 숫자형·문자열 저장 ID를 호환하며 설정의 고정 정보를 함께 저장합니다. 저장·갱신·이름 변경·삭제는 브라우저 저장 성공 후에만 반영합니다.
- 기존 v1/v2 저장값을 읽고 손상 항목을 정상 항목과 분리합니다. 마이그레이션 원본은 첫 변경 전에 `teambuilder.savedSettings.recovery`에 보관하고 기존 v1 키도 삭제하지 않습니다. 일반 저장값은 최대 12개이며 오래된 값을 자동 삭제하지 않습니다.
- 시간·연산량 제한에 도달해도 이미 찾은 유효 결과와 점수·검증 정보를 보존합니다. 후보 없이 제한에 걸린 경우는 배정 불가능과 구분합니다.
- Worker 실패 시 같은 탐색 제한과 검증 절차로 대체 실행합니다. 핵심 탐색을 나누어 실행하고 취소를 지원합니다. 입력 파싱·초기 검증·결과 렌더링은 동기 처리되므로 매우 큰 명단에서는 지연이 생길 수 있습니다.
- 그룹 이름 변경은 배정을 무효화하지 않으며 화면과 CSV·JSON에 즉시 반영합니다. 명단·규칙·역할·가중치·시드 등 배정 조건이 달라지면 기존 결과를 다시 생성해야 합니다.
- 결과 기록은 최대 20개·약 1.5MB의 직렬화 예산으로 관리합니다. 새 기록을 저장할 공간이 부족하면 오래된 기록부터 줄이고, 단일 기록이 크면 추가 후보를 제외합니다. 현재 배정 결과는 유지합니다. 개별 삭제는 다른 기록을 임의로 정리하지 않으며 전체 삭제는 확인을 거칩니다.
- 기록 복원 시 명단·정원·역할·고정·시드를 검증합니다. 손상 기록은 다른 기록에 영향을 주지 않으며 변경 전 원문은 `teambuilder.resultHistory.recovery`에 보관합니다.
- 역할 조회·허용 조합·선호 비용과 반복 가능성 검사를 요청 안에서 재사용합니다. 서로 다른 요청 사이에 오래된 역할 설정을 공유하지 않습니다.

설정·초안·기록은 현재 브라우저와 사이트 주소의 저장소에 보관됩니다. 브라우저 저장소를 지우면 사라지므로 중요한 설정은 **설정 내보내기**로 별도 보관하세요. JSON 데이터 형식 버전은 기존 1·2와 호환되며 앱 버전 `2.0.1`과 구분합니다. 저장할 수 없는 입력 범위는 성공으로 표시하지 않습니다.

## 회귀 검증

Node.js 18 이상에서 외부 패키지 설치 없이 실행합니다.

```sh
node --check engine.js
node --check script.js
node --check assignment-worker.js
node tests/regression.cjs
```

테스트는 별도 VM 문맥과 메모리 저장소를 사용하므로 실제 브라우저 저장값을 변경하지 않습니다. 균등·지정 정원, 규칙 충돌, 작은 문제의 완전 열거 대조, 역할, 시드 재현성, 탐색 제한, Worker 및 대체 실행, 저장 호환성·실패, 기록 복원, 수동 편집·Undo/Redo를 검증합니다. 브라우저 UI 흐름과 정적 리소스 로딩은 실제 브라우저에서 추가 확인합니다. 임시 QA 페이지·데이터·로그는 저장소에 포함하지 않습니다.

## English

Serve this directory with any static host; no runtime dependencies or build step are required. TeamBuilder supports constrained and seeded team assignment, roles and preferences, manual editing, Undo/Redo, saved configurations, draft recovery, history and CSV/JSON exports. Version 2.0.1 stabilizes legacy IDs, persistence, timeout results and cooperative Worker fallback. Run `node tests/regression.cjs` with Node.js 18+ to verify the core and persistence regressions. Browser storage is origin-specific and is not a backup; export important settings separately.
