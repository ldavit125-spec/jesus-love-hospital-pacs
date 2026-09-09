# 예수사랑병원 PACS — Antigravity 인수인계 가이드

이 문서는 현재 로컬 개발 환경을 다른 에이전트가 안전하게 이어받기 위한 작업 기준이다. 실제 진단 목적이 아닌 포트폴리오/교육용 PACS 시연 환경이다.

## 1. 현재 상태 요약

| 구성 | 주소 | 상태/역할 |
| --- | --- | --- |
| Orthanc | `http://localhost:8042` | DICOM 저장소·REST API |
| PACS 메인 앱 | `http://localhost:3000` | Study List 및 Study/Series/Instance 연결 |
| DICOM Viewer | `http://localhost:5174` | Cornerstone3D Stack Viewer |

현재 Orthanc에는 아래 두 Study만 남아 있어야 한다.

| 대표 표시명 | Orthanc Study ID | StudyInstanceUID | 구성 |
| --- | --- | --- | --- |
| Chest PA | `abae0b24-5a718d9e-1b560140-2cda3ae0-30b846cb` | `1.2.392.200036.9125.0.199302241758.16` | CR, 1 Series, 1 Instance, Accession `FUJI95714` |
| Contrast-enhanced Abdomen/Liver CT | `a1b5a65c-ad571e82-1f591079-d3d3ee56-caed5d87` | `1.3.6.1.4.1.14519.5.2.1.1706.8374.181961287094258156999595854067` | CT, 2 Series, 190 Instances |

## 2. CT 샘플의 확정 분류 원칙

HCC_004의 대표 표시명은 **`Contrast-enhanced Abdomen/Liver CT`** 이다.

- 실제 원본 태그: `Modality=CT`, `BodyPartExamined=LIVER`, `ContrastBolusRoute=Oral & IV`, `Rows=512`, `Columns=512`, 모든 Instance에 `PixelData` 존재.
- 원본 Study Description: `CHEST ABD LIVER PROTOC`.
- 원본 Series:
  - `PRE LIVER`: 20 Instances
  - `Recon 2: LIVER 3 PHASE A/P`: 170 Instances
- `Recon 2: LIVER 3 PHASE A/P`는 **원본 DICOM metadata**이므로 Orthanc와 Viewer에서 그대로 보존되어야 한다.
- 이 Study를 **Liver 3 Phase CT로 확정 표시하거나**, arterial/portal/delayed phase를 추측해 생성해서는 안 된다. 그러한 phase를 명시하는 근거 태그는 확인되지 않았다.
- 대표 분류명은 `lib/orthanc.ts`에서 해당 **StudyInstanceUID에만 적용하는 PACS 표시 정책**이다. DICOM 태그를 바꾸는 코드가 아니다.

## 3. Chest PA 샘플의 중요 주의사항

최종 Chest PA는 `FUJI95714`이며, 이전 테스트용 `9RG1` Study는 이미 Orthanc에서 삭제되었다.

- 원본 파일: `CR-MONO1-10-chest.dcm` (FUJI PHOTO FILM CO. LTD.).
- 이 파일은 Part 10 preamble 및 `DICM` prefix가 없는 raw DICOM dataset이다.
- `dicom-viewer-app/src/App.tsx`의 `ensurePart10ArrayBuffer`와 `beforeProcessing` 처리로 읽히도록 되어 있다.
- **절대로** raw DICOM을 PNG/JPG로 변환하거나, DICOM 태그를 수정하거나, 위 Part 10 보정 로직을 제거하지 않는다.
- MONOCHROME1이라 Viewer가 반전 및 VOI 설정을 처리한다. 정상 렌더링을 확인하지 않은 채 해당 설정을 제거하지 않는다.

## 4. 현재 코드 변경 및 작업 트리

현재 작업 트리에는 커밋되지 않은 변경이 있다. 기존 변경을 삭제·되돌리거나 `git reset --hard`를 실행하지 않는다.

| 파일 | 변경 목적 |
| --- | --- |
| `dicom-viewer-app/src/App.tsx` | 원본 DICOM header를 읽어 Viewer 정보 패널에 표시, raw FUJI DICOM Part 10 보정, Cornerstone 설정 및 wheel zoom |
| `dicom-viewer-app/src/index.css` | Viewer 정보 패널 스타일 |
| `lib/orthanc.ts` | HCC_004에 한해 PACS 대표 표시명 `Contrast-enhanced Abdomen/Liver CT` 적용 |
| `ANTIGRAVITY_HANDOFF_GUIDE.md` | 현재 인수인계 문서 |

`npm run build`(루트)는 현재 성공한다. Cornerstone codec 관련 Vite externalization/chunk-size 경고는 빌드 실패가 아니며, 확인 없이 패키지 버전이나 codec 구성을 바꾸지 않는다.

## 5. 안전한 확인 절차

1. Orthanc 상태부터 확인한다.

```powershell
Invoke-RestMethod http://localhost:8042/studies
```

2. 메인 앱에서 `http://localhost:3000`을 열어 CT 행이 다음처럼 보이는지 확인한다.

```text
HCC_004 | Contrast-enhanced Abdomen/Liver CT | CT | 190 Images
```

3. CT 행의 **영상 보기**를 사용한다. Viewer URL에는 `orthancStudyId=a1b5a65c-ad571e82-1f591079-d3d3ee56-caed5d87`가 포함되어야 한다.

4. Viewer에서 실제 CT 단면이 보이고 스택 수가 190인지 확인한다. 긴 초기 로딩은 약 100 MB의 무압축 CT PixelData 190장을 로드하는 동작과 관련될 수 있으므로, 측정 없이 worker 수·Cornerstone 버전·로딩 흐름을 변경하지 않는다.

5. FUJI Chest PA도 다시 열어 정상 출력되는지 확인한다. CT 작업 중 FUJI Study를 수정하거나 삭제하면 안 된다.

## 6. 금지 사항

- HCC_004 또는 FUJI95714 DICOM 파일/태그/PixelData 수정, 재인코딩, PNG/JPG fallback 생성 금지.
- `9RG1` 재업로드 금지.
- `FUJI95714` 및 HCC_004 외의 Orthanc 데이터, Orthanc 설정·스토리지 삭제 금지.
- CT 원본 SeriesDescription을 UI 편의상 바꾸지 말 것.
- phase 이름을 임의로 추가하거나 임상적 의미를 추측하지 말 것.
- Cornerstone, codec, Vite, `maxWebWorkers`를 성능 측정 없이 변경하지 말 것.
- unrelated 리팩터링, 의존성 버전 변경, force push, `git reset --hard` 금지.

## 7. 원본 출처와 임시 파일 위치

- HCC_004 공개 원본: Hugging Face `MedOtter/HCC-TACE-Seg` dataset.
- 업로드에 사용한 임시 원본 폴더:
  - `C:\Users\myin\AppData\Local\Temp\codex-liver-ct-check\HCC_004_pre_full` (PRE LIVER 20장)
  - `C:\Users\myin\AppData\Local\Temp\codex-liver-ct-check\HCC_004_series_full` (조영 Series 170장)
- 임시 폴더는 프로젝트 산출물이 아니다. Orthanc에 이미 업로드된 원본을 별도 승인 없이 재업로드·삭제·교체하지 않는다.

## 8. 다음 작업의 우선순위

1. CT Study를 실제 Viewer에서 렌더링하고 첫 화면·스택 수·Console 오류를 확인한다.
2. 문제 발생 시 DICOM 파일을 바꾸지 말고, 먼저 Orthanc HTTP 응답·Viewer Network/Console·`loadAndCacheImage`와 `setStack` 단계 중 어느 지점인지 측정한다.
3. 변경이 필요하면 최소 수정으로 제안한 뒤 구현한다. CT를 Liver 3 Phase라고 표시하는 변경은 수행하지 않는다.
