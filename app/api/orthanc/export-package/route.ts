import { fetchOrthanc, formatPatientName } from '../../../../lib/orthanc';
import { resourceId, HierarchyError } from '../../../../lib/orthanc-hierarchy';
import { createZipBuffer, type ZipEntry } from '../../../../lib/simple-zip';

type OrthancResource = {
  ID: string;
  Series?: string[];
  Instances?: string[];
  MainDicomTags?: Record<string, string>;
  PatientMainDicomTags?: Record<string, string>;
};

async function fetchOrthancJson<T = OrthancResource>(path: string): Promise<T> {
  const response = await fetchOrthanc(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new HierarchyError(`Orthanc ${path} 조회 실패 (HTTP ${response.status})`, response.status === 404 ? 404 : 502);
  }
  return response.json();
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { studyIds?: string[] };
    const rawStudyIds = body.studyIds;

    if (!Array.isArray(rawStudyIds) || rawStudyIds.length === 0) {
      return Response.json({ error: '내보낼 Study를 최소 1개 이상 선택해주세요.' }, { status: 400 });
    }

    // Validate all study IDs strictly
    const studyIds = rawStudyIds.map((id) => resourceId(String(id)));

    const zipEntries: ZipEntry[] = [];
    const csvRows: string[][] = [
      [
        'StudyID',
        'PatientID',
        'PatientName',
        'StudyDate',
        'AccessionNumber',
        'StudyDescription',
        'Modality',
        'StudyInstanceUID',
        'FileCount',
      ],
    ];

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dateFormatted = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    for (const studyId of studyIds) {
      const studyData = await fetchOrthancJson(`/studies/${studyId}`);
      const patientId = studyData.PatientMainDicomTags?.PatientID || studyData.MainDicomTags?.PatientID || 'UNKNOWN_PATIENT';
      const rawPatientName = studyData.PatientMainDicomTags?.PatientName || studyData.MainDicomTags?.PatientName || 'ANONYMIZED';
      const patientName = formatPatientName(rawPatientName);
      const studyDate = studyData.MainDicomTags?.StudyDate || '-';
      const accession = studyData.MainDicomTags?.AccessionNumber || '-';
      const studyDesc = studyData.MainDicomTags?.StudyDescription || '-';
      const studyUid = studyData.MainDicomTags?.StudyInstanceUID || '-';

      // Clean directory name: patientId or studyId
      const safeDirName = `${patientId.replace(/[^a-zA-Z0-9_\-]/g, '_')}_${studyId.slice(0, 8)}`;

      let fileCounter = 0;
      let primaryModality = '-';

      const seriesIds = studyData.Series || [];
      for (const sId of seriesIds) {
        const seriesData = await fetchOrthancJson(`/series/${resourceId(sId)}`);
        const modality = seriesData.MainDicomTags?.Modality || '-';
        if (primaryModality === '-' && modality !== '-') {
          primaryModality = modality;
        }

        const instanceIds = seriesData.Instances || [];
        for (const instId of instanceIds) {
          fileCounter++;
          const filename = `image${String(fileCounter).padStart(3, '0')}.dcm`;
          const entryPath = `${safeDirName}/${filename}`;

          // Fetch raw DICOM bytes from Orthanc /instances/{id}/file
          const fileResp = await fetchOrthanc(`/instances/${resourceId(instId)}/file`, { cache: 'no-store' });
          if (!fileResp.ok) {
            throw new Error(`Instance DICOM 파일 조회 실패 (ID: ${instId})`);
          }
          const arrayBuf = await fileResp.arrayBuffer();
          zipEntries.push({
            path: entryPath,
            data: Buffer.from(arrayBuf),
          });
        }
      }

      csvRows.push([
        studyId,
        patientId,
        patientName,
        studyDate,
        accession,
        studyDesc,
        primaryModality,
        studyUid,
        String(fileCounter),
      ]);
    }

    const totalDicomFilesCount = zipEntries.length;

    // Add study-info.csv
    const csvContent = '\uFEFF' + csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    zipEntries.push({
      path: 'study-info.csv',
      data: Buffer.from(csvContent, 'utf8'),
    });

    // Add README.txt (with UTF-8 BOM for Windows Notepad)
    const readmeContent = '\uFEFF' + `======================================================================
예수사랑병원 PACS 환자용 DICOM 미디어 패키지
======================================================================

[내보내기 정보]
- 시스템: 예수사랑병원 PACS (교육/포트폴리오용)
- 생성 일시: ${dateFormatted}
- 선택된 Study 수: ${studyIds.length}건
- 총 DICOM 파일 수: ${totalDicomFilesCount}건

[안내 및 주의사항]
1. 본 미디어 패키지는 환자용 의료영상 참조 및 포트폴리오/교육 목적입니다.
2. 실제 의료 진단용 시스템이 아니므로 진단 목적으로 사용할 수 없습니다.
3. 본 폴더 내의 각 디렉터리에는 표준 DICOM(.dcm) 영상 파일이 포함되어 있습니다.
4. 실제 CD/DVD 디스크 기록은 Windows 탐색기의 디스크 굽기 기능 또는 전용 미디어 기록 프로그램을 이용하십시오.
5. 포함된 메타데이터 목록은 함께 첨부된 'study-info.csv' 파일에서 확인하실 수 있습니다.

예수사랑병원 의료정보팀 / PACS 운영부
======================================================================
`;

    zipEntries.push({
      path: 'README.txt',
      data: Buffer.from(readmeContent, 'utf8'),
    });

    const zipBuffer = createZipBuffer(zipEntries);
    const filename = `PACS_EXPORT_${todayStr}.zip`;

    return new Response(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DICOM 패키지 생성 중 오류가 발생했습니다.';
    return Response.json({ error: message }, { status: 500 });
  }
}
