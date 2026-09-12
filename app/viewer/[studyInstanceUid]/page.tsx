import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchOrthanc, formatPatientName } from '../../../lib/orthanc';
import DicomViewer from './dicom-viewer';

type OrthancStudy = {
  ID: string;
  MainDicomTags?: Record<string, string>;
  PatientMainDicomTags?: Record<string, string>;
  Series?: string[];
};

type OrthancSeries = {
  ID: string;
  ParentStudy: string;
  MainDicomTags?: Record<string, string>;
  Instances?: string[];
};

const HCC_004_STUDY_UID = '1.3.6.1.4.1.14519.5.2.1.1706.8374.181961287094258156999595854067';
const HCC_004_DISPLAY_NAME = 'Contrast-enhanced Abdomen/Liver CT';

function value(tags: Record<string, string> | undefined, key: string) {
  return tags?.[key]?.trim() || '-';
}

function formatDate(val: string) {
  return /^\d{8}$/.test(val) ? `${val.slice(0, 4)}.${val.slice(4, 6)}.${val.slice(6, 8)}` : '-';
}

function formatTime(val: string) {
  return /^\d{4,}$/.test(val) ? `${val.slice(0, 2)}:${val.slice(2, 4)}` : '-';
}

async function getStudyDetail(studyInstanceUid: string) {
  const decodedUid = decodeURIComponent(studyInstanceUid);

  // 1. Fetch all studies from Orthanc
  const studiesRes = await fetchOrthanc('/studies', { cache: 'no-store' });
  if (!studiesRes.ok) {
    throw new Error(`Orthanc /studies failed: HTTP ${studiesRes.status}`);
  }
  const studyIds = (await studiesRes.json()) as string[];

  // 2. Find the target study by StudyInstanceUID or orthancStudyId
  let targetStudy: OrthancStudy | null = null;
  for (const id of studyIds) {
    const sRes = await fetchOrthanc(`/studies/${id}`, { cache: 'no-store' });
    if (sRes.ok) {
      const sData = (await sRes.json()) as OrthancStudy;
      if (sData.MainDicomTags?.StudyInstanceUID === decodedUid || sData.ID === decodedUid) {
        targetStudy = sData;
        break;
      }
    }
  }

  if (!targetStudy) {
    return null;
  }

  // 3. Fetch Series data and Instance IDs
  const seriesList = await Promise.all(
    (targetStudy.Series ?? []).map(async (sId) => {
      const resp = await fetchOrthanc(`/series/${sId}`, { cache: 'no-store' });
      if (!resp.ok) return null;
      return (await resp.json()) as OrthancSeries;
    })
  );

  const validSeries = seriesList.filter((s): s is OrthancSeries => s !== null);

  // Sort series by SeriesNumber
  validSeries.sort((a, b) => {
    const numA = Number.parseInt(a.MainDicomTags?.SeriesNumber || '0', 10);
    const numB = Number.parseInt(b.MainDicomTags?.SeriesNumber || '0', 10);
    return numA - numB;
  });

  const allInstanceIds: string[] = [];
  for (const s of validSeries) {
    if (Array.isArray(s.Instances)) {
      allInstanceIds.push(...s.Instances);
    }
  }

  const tags = targetStudy.MainDicomTags;
  const pTags = targetStudy.PatientMainDicomTags;

  let studyDescription = value(tags, 'StudyDescription');
  const firstSeries = validSeries[0];

  if (studyDescription === '-' || studyDescription.toUpperCase() === 'THORAX') {
    if (firstSeries?.Instances?.[0]) {
      try {
        const instTagsResp = await fetchOrthanc(`/instances/${firstSeries.Instances[0]}/simplified-tags`, { cache: 'no-store' });
        if (instTagsResp.ok) {
          const instTags = (await instTagsResp.json()) as Record<string, string>;
          const bodyPart = instTags.BodyPartExamined?.trim()?.toUpperCase();
          const viewPos = instTags.ViewPosition?.trim()?.toUpperCase();
          if (bodyPart === 'CHEST' && viewPos === 'PA') {
            studyDescription = 'Chest PA';
          } else if (bodyPart === 'CHEST') {
            studyDescription = viewPos ? `Chest ${viewPos}` : 'Chest PA';
          } else if (studyDescription.toUpperCase() === 'THORAX') {
            studyDescription = 'Chest PA';
          }
        } else if (studyDescription.toUpperCase() === 'THORAX') {
          studyDescription = 'Chest PA';
        }
      } catch {
        if (studyDescription.toUpperCase() === 'THORAX') {
          studyDescription = 'Chest PA';
        }
      }
    } else if (studyDescription.toUpperCase() === 'THORAX') {
      studyDescription = 'Chest PA';
    }
  }

  if (value(tags, 'StudyInstanceUID') === HCC_004_STUDY_UID) {
    studyDescription = HCC_004_DISPLAY_NAME;
  }

  const modality = validSeries.map((item) => value(item.MainDicomTags, 'Modality')).find((item) => item !== '-') ?? '-';

  return {
    orthancStudyId: targetStudy.ID,
    patientName: formatPatientName(value(pTags, 'PatientName')),
    patientId: value(pTags, 'PatientID'),
    studyDescription,
    studyDate: formatDate(value(tags, 'StudyDate')),
    studyTime: formatTime(value(tags, 'StudyTime')),
    modality,
    accessionNumber: value(tags, 'AccessionNumber'),
    studyInstanceUid: value(tags, 'StudyInstanceUID'),
    seriesInstanceUid: validSeries[0]?.MainDicomTags?.SeriesInstanceUID || '',
    instanceIds: allInstanceIds,
  };
}

export default async function ViewerPage({
  params,
}: {
  params: Promise<{ studyInstanceUid: string }>;
}) {
  const { studyInstanceUid } = await params;
  const study = await getStudyDetail(studyInstanceUid);

  if (!study) {
    notFound();
  }

  return (
    <div className="viewer-shell">
      <aside className="sidebar viewer-sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/jesus-love-hospital-logo.png" alt="예수사랑병원 로고" />
          </div>
          <div>
            <strong>예수사랑병원</strong>
            <span>JESUS LOVE HOSPITAL</span>
          </div>
        </div>
        <nav aria-label="주 메뉴">
          <p>PACS MENU</p>
          <Link href="/">
            <i>▤</i>
            <span>Study List</span>
          </Link>
          <span className="active">
            <i>◫</i>
            <span>DICOM Viewer</span>
            <b>›</b>
          </span>
          <Link href="/">
            <i>⚙</i>
            <span>System</span>
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="server">
            <i />
            <div>
              <strong>PACS Server</strong>
              <span>정상 연결</span>
            </div>
          </div>
          <p>v1.0.0 · Production</p>
        </div>
      </aside>

      <div className="viewer-main">
        <header className="viewer-topbar">
          <div>
            <strong>PACS</strong>
            <i />
            DICOM Viewer
          </div>
          <Link href="/" className="return-list">
            ← Study List로 돌아가기
          </Link>
        </header>
        <main className="viewer-content">
          <DicomViewer
            instanceIds={study.instanceIds}
            metadata={{
              patientName: study.patientName,
              patientId: study.patientId,
              studyDescription: study.studyDescription,
              studyDate: study.studyDate,
              modality: study.modality,
              studyInstanceUid: study.studyInstanceUid,
              seriesInstanceUid: study.seriesInstanceUid,
            }}
          />
        </main>
      </div>
    </div>
  );
}
