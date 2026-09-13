# 예수사랑병원 RIS/PACS 시스템 (Jesus Love Hospital RIS/PACS)

웹 표준 기술과 최신 의료 영상 라이브러리를 기반으로 구축된 **클라우드 친화형 RIS(방사선과 정보 시스템) 및 PACS(의료영상저장전송시스템) 솔루션**입니다.

본 프로젝트는 **AI-assisted development(Codex)를 활용하여 구현했으며, 요구사항 정의, 시스템 구성, 테스트, 오류 재현, 원인 검증 및 통합 작업을 직접 수행**했습니다.

---

## 1. 프로젝트 개요

- **프로젝트명**: 예수사랑병원 RIS/PACS 시스템 (Jesus Love Hospital RIS/PACS)
- **주요 목적**: 중소·전문 병원 환경에서 별도의 고가 전용 온프레미스 소프트웨어 설치 없이, 웹 브라우저만으로 환자 검사 오더 조회, 판독문 작성, DICOM 영상 조회/조작이 가능한 통합 진료 지원 플랫폼 구현
- **서비스 형태**: 웹 기반 반응형 단일 워크플로우 (RIS 웹 앱, PACS Study 워크리스트, 고성능 WebGL DICOM Web Viewer)

---

## 2. 개발 목적

1. **ActiveX/별도 뷰어 설치 없는 웹 표준 PACS 구현**: 최신 HTML5, WebGL, WebAssembly 기반 렌더링 기술을 사용하여 브라우저 환경에서 직접 DICOM 원본 영상을 실시간 디코딩·표시.
2. **RIS와 PACS 간의 데이터 결합 및 워크플로우 단축**: 환자 접수 및 검사 오더 관리(RIS)에서 원클릭으로 해당 검사의 DICOM 영상(PACS)으로 연동되는 일원화된 동선 제공.
3. **클라우드 네이티브 배포 아키텍처 실증**: Vercel(웹 프론트엔드/BFF 프록시), Railway(DICOM 아카이브 코어), Supabase(인증 및 관계형 데이터)로 역할을 분리하여 운영 유지보수성 및 확장성 확보.
4. **실제 의료 규격(DICOM Standard) 및 예외 데이터 대응**: 표준 DICOM은 물론, 임상 환경에서 흔히 발견되는 비표준/Raw 데이터셋(Preamble 누락, MONOCHROME1 등)을 클라이언트단에서 안전하게 전처리 렌더링할 수 있는 안정성 확보.

---

## 3. 전체 아키텍처

```
[ RIS Web App ] (Next.js / Vercel)
       │
       ▼ (환자 접수, 검사 오더, 판독문 관리, pacs_study_links 매핑 조회)
[ Supabase ] (PostgreSQL / Auth / RLS)
       ▲
       │ (사용자 계정 인증 / 역할 RBAC: RT, Radiologist, Admin)
       │
[ PACS & DICOM Viewer ] (Next.js & Cornerstone3D / Vercel)
       │
       ▼ (BFF 프록시 /api/orthanc/* & Basic Auth 보안 통신)
[ Orthanc DICOM Server ] (C++ Core / Railway Cloud Docker)
       │
       ▼ (WADO / REST API / DICOM Part 10 Storage)
[ Railway Volume Storage ] (DICOM Files)
```

- **RIS (Vercel)**: 접수, 촬영 대기, 판독문 작성 워크플로우를 담당하며, 검사(Exam)와 PACS 영상(Study) 간의 매핑 링크를 관리.
- **PACS / Viewer (Vercel)**: 모달리티별 검사 목록(Study List), 검사 계층 구조(Study → Series → Instance) 파싱, 고성능 스택 뷰어 제공.
- **Orthanc DICOM Server (Railway)**: C++ 기반 경량 오픈소스 DICOM 아카이브. REST API 및 WADO-URI 규격 지원.
- **Supabase**: 사용자 세션 인증(Auth), 프로필 및 역할 관리(Profiles), RIS 데이터베이스 관리.

---

## 4. 주요 기능

### ① PACS Study List (검사 목록 관리)
- **모달리티별 카테고리 필터링**: 전체, X-ray (CR/DX), CT, MRI, Ultrasound, Mammography, C-arm 탭 제공.
- **장비별 필터링**: 일반촬영 1실, 2실, 건강검진실, Portable 등 세부 검사실별 분기 필터링.
- **환자 및 검사 정보 그리드**: 환자 ID, 환자명(표준 공백 포맷팅), 검사일시, Modality, 검사 설명(Study Description), 시리즈/인스턴스 수량 표기.
- **시스템 상태 모니터링 (System Status)**: PACS 서버 및 Orthanc 연결 상태, 총 Study/Series/Instance 통계 실시간 진단.

### ② RIS 연동 판독 관리
- **검사 오더 연계**: 방사선사(RT) 접수/촬영 완료 상태와 영상의학과 전문의(Radiologist) 판독 대기/완료 워크플로우 연계.
- **원클릭 영상 조회**: RIS 판독 화면에서 `pacs_study_links`에 매핑된 검사일 경우 즉시 `[PACS 영상 조회]` 버튼 활성화.
- **미매핑 예외 처리**: 연동 영상이 없는 검사는 `[PACS 영상 없음]`으로 안전하게 안내.

---

## 5. RIS-PACS 연동 방식

1. **데이터 스키마 격리 및 무결성 보장**:
   - `exams.id`(RIS 내부 UUID PK)와 DICOM `StudyInstanceUID` / `orthanc_study_id`를 1:1 또는 1:N으로 연결하는 중간 브릿지 테이블 `pacs_study_links` 운용.
   - 외부 접수번호(`accession_number`)와 내부 기본키를 엄격히 분리하여 데이터 오염 방지.
2. **안전한 파라미터 전달**:
   - RIS 판독 화면에서 영상 호출 시 `studyInstanceUid`, `orthancStudyId`를 쿼리 파라미터로 안전하게 전달.
   - 데이터 출처 식별자(`data_source: 'real_public' | 'synthetic_demo'`)를 통해 실제 임상 데이터와 시연용 합성 데이터를 명확히 구분.
3. **무결성 원칙**:
   - RIS의 환자 메타데이터에 맞추기 위해 원본 DICOM 바이너리 태그를 임의로 변조하지 않으며, DICOM 원본의 불변성을 유지.

---

## 6. Orthanc 연동 방식

1. **BFF(Backend For Frontend) API 프록시 구조**:
   - 브라우저가 외부 Orthanc 서버로 직접 접근하지 않고, Next.js API Routes (`/api/orthanc/*`)를 경유하도록 설계.
   - 클라이언트 측 CORS(Cross-Origin Resource Sharing) 이슈를 원천 차단.
2. **인증 보호 통신**:
   - Orthanc에 설정된 관리자 계정(`ORTHANC_USERNAME`, `ORTHANC_PASSWORD`)을 서버 사이드 환경변수로 관리하며, 서버 간 Basic Auth 헤더를 자동 주입하여 통신.
3. **계층적 메타데이터 순회**:
   - Study 상세 진입 시 `Study → Series 목록 조회 → Instance 목록 조회`를 비동기 병렬 요청(`Promise.all`)하여 응답 지연 최소화.
   - 단일 인스턴스 바이너리 스트리밍(`GET /instances/{id}/file`)을 통해 브라우저로 청크 전송.

---

## 7. DICOM Viewer 기능

Cornerstone3D(v5) 및 WebGL 기술을 사용한 고성능 웹 DICOM 뷰어입니다.

1. **인터랙티브 영상 조작 도구**:
   - **Zoom / Pan**: 마우스 드래그를 통한 자유 확대/축소 및 화면 이동.
   - **Window / Level (W/L)**: 마우스 드래그를 통한 Window Center / Window Width 실시간 조절(대비/밝기 최적화).
   - **Stack Scroll**: 다중 슬라이스 검사(CT, MRI) 마우스 휠 스크롤 순회.
   - **Reset**: 뷰포트 확대율, 중심 위치, VOI 윈도우 초기화.
2. **DICOM 파싱 및 렌더링 예외 처리 (엔지니어링 핵심)**:
   - **Non-Part 10 Raw DICOM 자동 전처리**:
     - 일부 구형 장비(FUJI CR 등)에서 발생하는 Part 10 Preamble(128바이트 빈 헤더) 및 `DICM` 매직 넘버 누락 파일(`Implicit VR Little Endian`)을 감지.
     - `beforeProcessing` 훅에서 Part 10 Envelope(Preamble + File Meta Information Header)을 브라우저 메모리상에서 동적으로 래핑 생성하여 Cornerstone 파서가 정상 인식하도록 보정.
   - **MONOCHROME1 자동 반전 및 VOI 매핑**:
     - 0 값이 흰색으로 표시되는 `MONOCHROME1` 영상에 대해 `invert: true` 및 Window Center(`550`)/Width(`1024`) 자동 보정 적용.
   - **Zero Pixel Spacing 방어**:
     - `0.000\0.000` 등 비정상 Pixel Spacing 메타데이터로 인해 WebGL GPU 텍스처 폭이 0이 되는 오류를 방지하기 위해 커스텀 Metadata Provider를 등록하여 기본 종횡비 보장.
3. **오버레이 및 기술 정보 패널**:
   - 해부학적 단면 크기(Rows × Columns), Transfer Syntax, 모달리티 규격 표시.
   - 환자 식별 정보(성명, 성별, 나이, 검사명) HUD 오버레이.

---

## 8. 보안 구조

1. **역할 기반 접근 제어 (RBAC - Role-Based Access Control)**:
   - Supabase Auth 및 `profiles` 테이블을 연동하여 시스템 사용자 권한 통제.
   - `rt`(방사선사), `radiologist`(영상의학과 전문의), `admin`(관리자) 역할 부여.
   - 미등록 계정 및 허용되지 않은 역할은 즉시 세션 차단(`signOut`).
2. **자격 증명 은닉**:
   - Orthanc 내부 접속 인증 정보, Supabase Service Role Key 등 민감 정보는 Vercel/Railway 환경 변수로 격리(클라이언트 코드 노출 차단).
3. **DICOM 데이터 무결성 보호**:
   - 웹 뷰어에서 원본 파일을 변조할 수 없도록 Read-Only 스트림 서비스.

---

## 9. 배포 구조

| 구성 요소 | 호스팅 플랫폼 | 실행 환경 / 프로토콜 | 설명 |
| :--- | :--- | :--- | :--- |
| **PACS 메인 앱 & 뷰어** | **Vercel** | Next.js 16 (Node.js 22 LTS, HTTPS) | 웹 프론트엔드 및 Orthanc BFF API 프록시 |
| **Orthanc PACS Core** | **Railway** | Docker Container (C++ Orthanc, HTTPS) | 클라우드 DICOM 서버 및 스토리지 볼륨 |
| **Auth & Database** | **Supabase** | Managed PostgreSQL & GoTrue Auth (HTTPS) | 사용자 인증 세션, RBAC 프로필, 검사 연동 링크 |

---

## 10. 테스트 완료 항목

실제 테스트 검증을 마친 주요 검사 데이터셋 및 동작 항목입니다.

| 모달리티 | 대표 케이스 | 데이터 구성 | 검증 결과 |
| :--- | :--- | :--- | :--- |
| **CR (X-ray)** | Chest PA (FUJI95714) | 1 Series, 1 Instance (Raw DICOM) | Part 10 헤더 동적 보정 및 MONOCHROME1 정상 렌더링 완료 |
| **CT** | Contrast-enhanced Abdomen/Liver CT (HCC_004) | 2 Series, 총 190 Instances (약 100MB) | 다중 슬라이스 대용량 스택 연속 스크롤 및 W/L 조작 검증 |
| **MR** | Brain MRI (5Yp0E) | IRM cérébrale, neuro-crâne | Cross-sectional 뷰포트 중심/스케일 최적화 및 로딩 검증 |
| **US** | Synthetic Cardiac Doppler Echo Demo | 컬러 도플러 초음파 프레임 | RGB/단색 포토메트릭 VOI 렌더링 검증 |
| **MG** | Synthetic Mammography Demo | 유방촬영 4-뷰 (L-CC, L-MLO, R-CC, R-MLO) | 고해상도 매모그래피 뷰포트 전환 검증 |
| **C-arm** | Synthetic C-arm Lumbar Procedure Demo | 시술 투시 전/후 프레임 | XA/RF 계열 인터벤션 영상 표출 검증 |
| **연동 통합** | RIS ↔ PACS 링크 조회 | `pacs_study_links` | RIS 판독실에서 버튼 클릭 시 해당 Study UID 뷰어 즉시 호출 |

---

## 11. 사용 기술

### Frontend / Web App
- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **DICOM Imaging**: Cornerstone3D (`@cornerstonejs/core`, `@cornerstonejs/tools`, `@cornerstonejs/dicom-image-loader`), `dicom-parser`
- **Styling**: Vanilla CSS, Modern CSS Grid/Flexbox Layout, Dark-mode 의료 전용 UI 테마
- **Build & Dev Tool**: Vite 8 (Viewer 전용 서브프로젝트 모듈 번들러), Webpack (Next.js)

### Backend / Server / API
- **DICOM Server Engine**: Orthanc DICOM Server (C++ Core REST/WADO API)
- **BFF Proxy**: Next.js Route Handlers (Edge/Node Serverless Functions)
- **Database & Auth**: Supabase (PostgreSQL, Supabase Auth SDK)

### Infrastructure & Deployment
- **Frontend Hosting**: Vercel
- **PACS Cloud Container**: Railway (Dockerized Orthanc + Persistent Volume)
- **Version Control**: Git, GitHub

---

## 12. AI-assisted Development 방식

본 프로젝트는 **AI-assisted development(Codex)를 활용하여 구현했으며, 요구사항 정의, 시스템 구성, 테스트, 오류 재현, 원인 검증 및 통합 작업을 직접 수행**했습니다.

1. **요구사항 정의 및 아키텍처 설계**:
   - 웹 기반 RIS/PACS 연동 시나리오 수립 및 Vercel - Railway - Supabase 3티어 아키텍처 규격 도출.
2. **트러블슈팅 및 버그 재현·원인 규명**:
   - **Raw DICOM 로딩 실패 원인 규명**: 일반적인 브라우저 라이브러리에서 로드되지 않던 FUJI CR 파일의 바이트 스트림을 분석하여 Part 10 Preamble 누락을 확인하고, 런타임 클라이언트 메모리 헤더 복원 알고리즘 설계 및 구현.
   - **WebGL 렌더링 중단 해결**: 비정상 Pixel Spacing 메타데이터 태그(`0.000\0.000`)에 대응하는 커스텀 메타데이터 공급자 주입.
   - **MONOCHROME1 흑백 반전 보정**: 영상 획득 규격에 맞춘 초기 VOI 범위 자동 계산 로직 도출.
3. **통합 검증 및 안전성 보장**:
   - 원본 DICOM 바이너리와 태그의 불변성을 유지하는 데이터 보존 원칙 수립.
   - 실제 대용량 복합 시리즈 CT(190장)와 다중 모달리티(X-ray, CT, MRI, US, MG, C-arm)의 브라우저 로딩 성능 측정 및 검증 완료.
