import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PACS_STUDIES } from '../../pacs-data';
import DicomViewer from './dicom-viewer';

export default async function ViewerPage({ params }: { params: Promise<{ studyInstanceUid: string }> }) {
  const { studyInstanceUid } = await params;
  const study = PACS_STUDIES.find((item) => item.studyInstanceUid === decodeURIComponent(studyInstanceUid));

  if (!study) notFound();

  const metadata = [
    ['환자명', study.patientName],
    ['Patient ID', study.patientId],
    ['검사명', study.studyDescription],
    ['검사일시', `${study.studyDate} ${study.studyTime}`],
    ['Modality', study.modality],
    ['촬영 장비', study.acquisitionEquipmentName ?? '미등록'],
    ['Accession No.', study.accessionNumber],
    ['Study Instance UID', study.studyInstanceUid],
  ];

  return (
    <div className="viewer-shell">
      <aside className="sidebar viewer-sidebar">
        <div className="brand"><div className="brand-mark"><img src="/jesus-love-hospital-logo.png" alt="예수사랑병원 로고" /></div><div><strong>예수사랑병원</strong><span>JESUS LOVE HOSPITAL</span></div></div>
        <nav aria-label="주 메뉴">
          <p>PACS MENU</p>
          <Link href="/"><i>▤</i><span>Study List</span></Link>
          <span className="active"><i>◫</i><span>DICOM Viewer</span><b>›</b></span>
          <Link href="/"><i>⚙</i><span>System</span></Link>
        </nav>
        <div className="sidebar-footer"><div className="server"><i /><div><strong>PACS Server</strong><span>정상 연결</span></div></div><p>v1.0.0 · UI Prototype</p></div>
      </aside>

      <div className="viewer-main">
        <header className="viewer-topbar"><div><strong>PACS</strong><i />DICOM Viewer</div><Link href="/" className="return-list">← Study List로 돌아가기</Link></header>
        <main className="viewer-content">
          <div className="viewer-heading"><div><p>DICOM VIEWER</p><h1>영상 뷰어</h1></div><span>UI Prototype · 영상 데이터 미연결</span></div>
          <section className="study-summary" aria-label="선택 검사 정보">
            {metadata.map(([label, value]) => <div key={label} className={label === 'Study Instance UID' ? 'wide' : ''}><span>{label}</span><strong title={value}>{value}</strong></div>)}
          </section>
          <DicomViewer />
        </main>
      </div>
    </div>
  );
}
