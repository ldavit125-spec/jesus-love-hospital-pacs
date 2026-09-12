# 예수사랑병원 PACS & DICOM 뷰어 교육원 실행 및 시연 가이드

내일 교육원에서 원활하게 환경을 구성하고 시연하기 위한 핵심 실행 절차와 주의사항입니다.

---

## 1. 사전 준비 및 포트 확인

PACS 시스템은 총 3개의 서버/프로세스가 유기적으로 동작해야 합니다.

| 구성 요소 | 기술 스택 | 기본 포트 | 역할 |
| :--- | :--- | :--- | :--- |
| **Orthanc PACS Server** | C++ DICOM 서버 | `8042` | DICOM 저장소, REST API, WADO 파일 제공 |
| **PACS 메인 웹 앱** | Next.js | `3000` | 환자/검사 목록(Study List), 상세 드로어, 계층 구조 |
| **DICOM Viewer 웹 앱** | Vite + React + Cornerstone3D | `5174` | 고성능 DICOM 렌더링, W/L, Zoom, Pan |

> [!IMPORTANT]
> **포트 충돌 확인**:  
> 교육원 PC에서 기존 프로세스가 `8042`, `3000`, `5174`를 선점하고 있는지 먼저 확인하세요.

---

## 2. 서버 실행 순서 (권장 절차)

터미널을 3개 열어 아래 순서대로 실행합니다.

### ① 1번 터미널: Orthanc 실행
- Orthanc 실행 파일 또는 서비스를 구동합니다 (`localhost:8042`).
- 브라우저에서 `http://localhost:8042` 접속 확인.
- 현재 업로드된 Chest PA Study가 정상 등록되어 있는지 확인 (`/studies`).

### ② 2번 터미널: Next.js 메인 앱 실행
```bash
# jesus-love-hospital-pacs 루트 디렉터리
npm run dev
# 또는 npx next dev -p 3000
```
- 브라우저에서 `http://localhost:3000` 접속 확인.

### ③ 3번 터미널: DICOM Viewer 실행
```bash
# dicom-viewer-app 디렉터리로 이동
cd dicom-viewer-app
npm run dev -- --port 5174 --host
```
- 브라우저에서 `http://localhost:5174` 접속 확인.
- Vite의 `/orthanc` 프록시가 `http://localhost:8042`로 정상 전달되는지 확인.

---

## 3. 핵심 시연 포인트

1. **Study List (검사 목록)**:
   - X-ray(Chest PA) 검사 1건이 목록에 정확히 표시되는지 확인.
   - 우측의 **[영상 보기]** 버튼 클릭 시 새 창에서 Cornerstone3D 뷰어가 바로 열리며 DICOM 영상이 로드되는지 시연.

2. **검사 상세보기 (드로어) & 계층 구조**:
   - 목록의 **[상세보기]** 버튼 또는 행 클릭 시 오른쪽 드로어 오픈.
   - **Study → Series → Instance** 계층 구조 확인.
   - Series 또는 Instance 행의 **[영상 보기]** 버튼을 눌러도 동일한 DICOM 영상이 안정적으로 로드되는지 시연 (검은 화면 버그 해결 완료).

3. **DICOM 뷰어 조작 도구**:
   - **Zoom / Pan**: 마우스 드래그를 통한 확대/축소 및 이동.
   - **Window / Level**: 밝기 및 대비 조절.
   - **Reset**: 뷰포트 초기화.

---

## 4. 반드시 주의할 점 (트러블슈팅 가이드)

### ⚠️ 1. DICOM 뷰어 검은 화면 관련 (해결 완료된 메커니즘 숙지)
- **배경**: 현재 샘플(`CR-MONO1-10-chest.dcm`)은 Part 10 Header(128바이트 preamble + `DICM` 매직 바이트)가 없는 **raw DICOM(Implicit VR Little Endian)** 파일입니다.
- **처리 메커니즘**: `App.tsx`의 `dicomImageLoader.internal.setOptions({ beforeProcessing })` 훅에서 Part 10 envelope을 자동 생성하여 Cornerstone 파서에 전달하도록 구성되어 있습니다.
- **주의**: `dicom-viewer-app/src/App.tsx`의 `ensurePart10ArrayBuffer` 로직이나 Cornerstone 버전을 임의로 수정/되돌리지 마세요.

### ⚠️ 2. MONOCHROME1 반전 & VOI 윈도잉
- 이번 Chest PA는 **MONOCHROME1** (0이 흰색, 고값이 검은색) 형식입니다.
- 뷰어 로딩 시 자동으로 `invert: true` 및 WindowCenter(`550`), WindowWidth(`1024`)가 적용되도록 세팅되어 있습니다. 수동 조절 시에도 정상 동작합니다.

### ⚠️ 3. 뷰어 단독 접근 시 URL 파라미터 필요
- DICOM 뷰어(`:5174`)를 URL 파라미터 없이 단독으로 열면 기본 샘플(`sample-xray.dcm`)로 폴백됩니다.
- Orthanc의 실제 Study/Instance 영상을 보려면 반드시 `studyInstanceUid`, `orthancStudyId` 또는 `orthancInstanceId` 파라미터가 포함된 URL(메인 PACS 앱에서 클릭하여 생성되는 링크)로 접속해야 합니다.

### ⚠️ 4. 환경 변수 및 의존성 설치
- 교육원 PC에서 새로 클론한 경우:
  ```bash
  # 루트
  npm install
  # 뷰어 앱
  cd dicom-viewer-app
  npm install
  ```
- Node.js 버전은 **v20 이상** 권장.

---

## 5. 현재 상태 메모 (집에서 이어서 작업할 때)

### 현재 확인된 주요 Study

| 용도 | PatientID | StudyDescription | Modality | 상태 |
|---|---|---|---|---|
| 실제 Chest PA | `-` / Accession `FUJI95714` | `Chest PA` | `CR` | Orthanc 복구됨 |
| Liver CT | `HCC_004` | `Contrast-enhanced Abdomen/Liver CT` | `CT` | 유지 |
| Brain MRI | `5Yp0E` | `IRM cérébrale, neuro-crâne` | `MR` | 유지 |
| Synthetic Echo Demo | `DEMO-US-ECHO-001` | `Synthetic Cardiac Doppler Ultrasound Demo` | 원본 `OT`, 표시 `US Demo` | 유지 |
| Synthetic Mammography Demo | `DEMO-MG-001` | `Synthetic Mammography Demo` | 원본 `MG`, 표시 `MG Demo` | 유지 |
| Synthetic C-arm Demo | `DEMO-CARM-001` | `Synthetic C-arm Lumbar Procedure Demo` | 원본 `OT`, 표시 `C-arm Demo` | 유지 |

삭제된 데이터:

- Pelvic Ultrasound `US PELVIS W TRANSVAGINAL` 32개 Study
- Synthetic Liver CT 3-Phase Demo
- FUJI95714 placeholder 및 테스트용 9RG1 Study

### 집에서 작업할 때의 안전 순서

1. 먼저 `git status`와 현재 브랜치를 확인합니다.
2. Orthanc(`8042`) → PACS(`3000`) → Viewer(`5174`) 순서로 실행합니다.
3. `http://localhost:8042/system`, `http://localhost:3000/api/orthanc/studies`가 응답하는지 확인합니다.
4. PACS에서 Study List가 0건이면 Viewer나 DICOM 파일을 먼저 수정하지 말고 Orthanc 연결/API부터 확인합니다.
5. 실제 Study 삭제 전에는 PatientID, StudyDescription, Orthanc Study ID를 반드시 대조합니다.

### 절대 주의

- `git reset --hard`, `git restore`, force push를 사용하지 않습니다.
- Orthanc Storage/Index를 초기화하지 않습니다.
- 실제 DICOM 태그를 임의로 수정하거나, AP 영상을 PA로 이름을 바꾸지 않습니다.
- Synthetic Demo는 실제 환자 영상이나 임상 측정값으로 표현하지 않습니다.
- `FUJI95714` 원본은 Part 10 preamble이 없는 오래된 raw DICOM일 수 있으므로 `ensurePart10ArrayBuffer` 로직을 유지합니다.
- 현재 Cornerstone Viewer는 일부 RGB Secondary Capture와 일부 Public Test Ultrasound에서 Stack 준비가 멈출 수 있습니다. 이 경우 패키지 교체나 대규모 리팩터링을 먼저 하지 말고 브라우저 Console/Network와 실제 Transfer Syntax를 확인합니다.
- `maxWebWorkers = 1` 설정과 Cornerstone 버전은 임의로 변경하지 않습니다.
- 새 DICOM을 업로드하기 전에는 반드시 Modality, PixelData, TransferSyntaxUID, Rows/Columns, Frame 수를 실제 헤더에서 확인합니다.

### Git 저장 메모

- 최근 원격 반영 커밋: `0ba073b` (`fix: include synthetic echo in ultrasound menu`)
- 로그, 백업 폴더, `node_modules`, 캐시, 대용량 임시 파일은 커밋하지 않습니다.
