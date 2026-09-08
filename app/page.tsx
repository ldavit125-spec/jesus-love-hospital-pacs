'use client';

import { useEffect, useMemo, useState } from 'react';

import { buildViewerUrl, type StudyListItem } from '../lib/orthanc';
import StudyDrawer from './study-drawer';
import StudyHierarchy from './study-hierarchy';

const menuItems = [
  ['▤', 'Study List'], ['⚙', 'System'],
] as const;

export type ModalityCategory = 'ALL' | 'X-ray' | 'CT' | 'MRI' | 'Ultrasound' | 'Mammography' | 'C-arm';

interface ModalitySubmenuItem {
  id: ModalityCategory;
  label: string;
}

const MODALITY_SUBMENUS: ModalitySubmenuItem[] = [
  { id: 'ALL', label: '전체 검사' },
  { id: 'X-ray', label: 'X-ray' },
  { id: 'CT', label: 'CT' },
  { id: 'MRI', label: 'MRI' },
  { id: 'Ultrasound', label: 'Ultrasound' },
  { id: 'Mammography', label: 'Mammography' },
  { id: 'C-arm', label: 'C-arm' },
];

const XRAY_EQUIPMENT_OPTIONS = [
  '전체 장비',
  'X-ray 1',
  'X-ray 2',
  '건강검진 X-ray',
  'Portable X-ray',
] as const;

const koreanWeekdays = ['일', '월', '화', '수', '목', '금', '토'];

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { date: `${year}. ${month}. ${day}`, weekday: `${koreanWeekdays[date.getDay()]}요일` };
}

function matchesCategory(study: StudyListItem, category: ModalityCategory): boolean {
  if (category === 'ALL') return true;
  const mod = (study.modality || '').trim().toUpperCase();
  const desc = (study.studyDescription || '').trim().toUpperCase();
  const station = (study.stationName || '').trim().toUpperCase();

  if (category === 'X-ray') {
    const xRayCodes = ['CR', 'DX', 'RG', 'XR', 'PX', 'IO'];
    return (
      xRayCodes.includes(mod) ||
      mod.includes('X-RAY') ||
      mod.includes('XRAY') ||
      mod.includes('PORTABLE') ||
      desc.includes('X-RAY') ||
      desc.includes('PORTABLE') ||
      station.includes('X-RAY')
    );
  }
  if (category === 'CT') {
    return mod === 'CT' || mod.includes('CT');
  }
  if (category === 'MRI') {
    return mod === 'MR' || mod === 'MRI';
  }
  if (category === 'Ultrasound') {
    return mod === 'US' || mod === 'ULTRASOUND' || mod.includes('SONO') || desc.includes('SONO');
  }
  if (category === 'Mammography') {
    return mod === 'MG' || mod === 'MAMMOGRAPHY' || mod.includes('MAMMO');
  }
  if (category === 'C-arm') {
    return ['XA', 'RF', 'C-ARM', 'CARM'].includes(mod) || mod.includes('C-ARM') || desc.includes('C-ARM');
  }
  return false;
}

function matchesEquipment(study: StudyListItem, category: ModalityCategory, equipment: string): boolean {
  if (equipment === '전체 장비') return true;

  const eq = equipment.toLowerCase();
  const station = (study.stationName || '').toLowerCase();
  const desc = (study.studyDescription || '').toLowerCase();
  const mod = (study.modality || '').toLowerCase();

  if (equipment === 'X-ray 1') {
    return station.includes('x-ray 1') || desc.includes('x-ray 1') || station.includes('x-ray1') || desc.includes('x-ray1');
  }
  if (equipment === 'X-ray 2') {
    return station.includes('x-ray 2') || desc.includes('x-ray 2') || station.includes('x-ray2') || desc.includes('x-ray2');
  }
  if (equipment === '건강검진 X-ray') {
    return station.includes('검진') || desc.includes('검진') || station.includes('건강검진') || desc.includes('건강검진');
  }
  if (equipment === 'Portable X-ray') {
    return station.includes('portable') || desc.includes('portable') || mod.includes('portable');
  }

  return station === eq || desc.includes(eq) || mod === eq;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [isStudyListOpen, setIsStudyListOpen] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ModalityCategory>('ALL');
  const [equipment, setEquipment] = useState('전체 장비');
  const [status, setStatus] = useState('전체 상태');
  const [orthancStudies, setOrthancStudies] = useState<StudyListItem[]>([]);
  const [orthancError, setOrthancError] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [localDate, setLocalDate] = useState<Date | null>(null);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [drawerStudy, setDrawerStudy] = useState<StudyListItem | null>(null);

  useEffect(() => {
    let midnightTimer: number;
    const updateDate = () => {
      const now = new Date();
      setLocalDate(now);
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      midnightTimer = window.setTimeout(updateDate, nextMidnight.getTime() - now.getTime());
    };
    updateDate();
    return () => window.clearTimeout(midnightTimer);
  }, []);

  useEffect(() => {
    fetch('/api/orthanc/studies')
      .then(async (response) => {
        const result = await response.json() as { studies: StudyListItem[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Orthanc 연결에 실패했습니다.');
        setOrthancStudies(result.studies);
      })
      .catch((error: unknown) => setOrthancError(error instanceof Error ? error.message : 'Orthanc 연결에 실패했습니다.'));
  }, []);

  const formattedLocalDate = localDate ? formatLocalDate(localDate) : null;

  const studies = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return orthancStudies.filter((study) => {
      const studyDate = study.studyDate.replaceAll('.', '-');
      const searchable = [study.patientId, study.patientName, study.accessionNumber, study.studyInstanceUid];
      return (!keyword || searchable.some((value) => value.toLowerCase().includes(keyword)))
        && matchesCategory(study, selectedCategory)
        && matchesEquipment(study, selectedCategory, equipment)
        && status === '전체 상태'
        && (!fromDate || studyDate >= fromDate)
        && (!toDate || studyDate <= toDate);
    });
  }, [orthancStudies, query, selectedCategory, equipment, status, fromDate, toDate]);

  const availableEquipments = useMemo(() => {
    if (selectedCategory === 'X-ray') {
      return [...XRAY_EQUIPMENT_OPTIONS];
    }
    if (selectedCategory === 'ALL') {
      const rawModalities = Array.from(new Set(orthancStudies.map((s) => s.modality).filter(Boolean)));
      return ['전체 장비', ...XRAY_EQUIPMENT_OPTIONS.slice(1), ...rawModalities.filter((m) => !['CR', 'DX', 'RG'].includes(m.toUpperCase()))];
    }
    return ['전체 장비'];
  }, [selectedCategory, orthancStudies]);

  const kpiStats = useMemo(() => {
    return {
      total: studies.length,
      unread: studies.filter((s) => s.readingStatus === 'unread').length,
      reading: studies.filter((s) => s.readingStatus === 'reading').length,
      completed: studies.filter((s) => s.readingStatus === 'completed').length,
    };
  }, [studies]);

  const selectedStudy = studies.find((study) => study.orthancStudyId === selectedStudyId);

  const reset = () => {
    setQuery('');
    setSelectedCategory('ALL');
    setEquipment('전체 장비');
    setStatus('전체 상태');
    setFromDate('');
    setToDate('');
  };

  const openViewer = (
    studyInstanceUid: string,
    accessionNumber?: string,
    patientId?: string,
    seriesInstanceUid?: string,
    orthancStudyId?: string,
    orthancSeriesId?: string
  ) => {
    const url = buildViewerUrl({
      studyInstanceUid,
      accessionNumber,
      patientId,
      seriesInstanceUid,
      orthancStudyId,
      orthancSeriesId,
    });
    window.open(url, '_blank');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><img src="/jesus-love-hospital-logo.png" alt="예수사랑병원 로고" /></div><div><strong>예수사랑병원</strong><span>JESUS LOVE HOSPITAL</span></div></div>
        <nav aria-label="주 메뉴">
          <p>PACS MENU</p>
          {menuItems.map(([icon, label]) => {
            if (label === 'Study List') {
              return (
                <div key={label} className="sidebar-group">
                  <button
                    type="button"
                    className="active has-sub"
                    onClick={() => setIsStudyListOpen((prev) => !prev)}
                    aria-expanded={isStudyListOpen}
                  >
                    <i>{icon}</i>
                    <span>{label}</span>
                    <b>{isStudyListOpen ? '▾' : '›'}</b>
                  </button>
                  {isStudyListOpen && (
                    <div className="sidebar-subnav" role="menu" aria-label="Study List 하위 메뉴">
                      {MODALITY_SUBMENUS.map((sub) => {
                        const isSelected = selectedCategory === sub.id;
                        const count = sub.id === 'ALL'
                          ? orthancStudies.length
                          : orthancStudies.filter((s) => matchesCategory(s, sub.id)).length;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            role="menuitem"
                            className={`sub-item ${isSelected ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedCategory(sub.id);
                              setEquipment('전체 장비');
                            }}
                          >
                            <span>{sub.label}</span>
                            <span className="sub-count">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button key={label} type="button">
                <i>{icon}</i>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer"><div className="server"><i /><div><strong>PACS Server</strong><span>정상 연결</span></div></div><p>v1.0.0 · UI Prototype</p></div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="system-title"><strong>PACS</strong><i />의료영상정보시스템</div>
          <label className="global-search"><b>⌕</b><input aria-label="통합 검색" placeholder="환자명, 환자번호, 검사번호 검색" value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label>
          <div className="user"><button aria-label="알림" type="button">♧<i /></button><span className="avatar">관</span><div><strong>관리자</strong><small>영상의학과</small></div><b>⌄</b></div>
        </header>

        <main className="content">
          <div className="heading"><div><p>STUDY MANAGEMENT</p><h1>영상검사 목록</h1><span>등록된 의료영상 검사를 조회하고 관리합니다.</span></div><div className="today"><em>오늘</em><strong>{formattedLocalDate?.date}</strong><span>{formattedLocalDate?.weekday}</span></div></div>

          <section className="stats" aria-label="검사 현황">
            <article>
              <i className="blue">▤</i>
              <div>
                <span>{selectedCategory === 'ALL' ? '전체 검사' : `${selectedCategory} 검사`}</span>
                <strong>{kpiStats.total}<small> 건</small></strong>
              </div>
              <em>{selectedCategory === 'ALL' ? '전체 등록 검사 기준' : `${selectedCategory} 필터 기준`}</em>
            </article>
            <article><i className="amber">◷</i><div><span>미판독</span><strong>{kpiStats.unread}<small> 건</small></strong></div><em className="urgent">상태 미연동</em></article>
            <article><i className="purple">◉</i><div><span>판독중</span><strong>{kpiStats.reading}<small> 건</small></strong></div><em>진행 중</em></article>
            <article><i className="green">✓</i><div><span>판독완료</span><strong>{kpiStats.completed}<small> 건</small></strong></div><em>상태 미연동</em></article>
          </section>

          <section className="filter-panel">
            <header><h2>검사 검색</h2><button type="button" onClick={reset}>↻ 조건 초기화</button></header>
            <div className="filters">
              <label><span>검색어</span><div className="input"><b>⌕</b><input placeholder="환자명, 환자번호, 검사번호" value={query} onChange={(e) => setQuery(e.target.value)} /></div></label>
              <label><span>검사일</span><div className="dates"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /><i>—</i><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div></label>
              <label><span>장비</span><select value={equipment} onChange={(e) => setEquipment(e.target.value)}>{availableEquipments.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>판독상태</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option>전체 상태</option></select></label>
              <button className="search-btn" type="button">⌕ &nbsp;조회</button>
            </div>
          </section>

          <section className="table-card">
            <header className="table-tools"><div><h2>검사 목록</h2><span>총 <strong>{studies.length}</strong>건</span></div><div><button type="button">⇩ 목록 내보내기</button><button className="add" type="button">＋ 검사 등록</button></div></header>
            <div className="table-scroll">
              <table>
                <thead><tr><th><input aria-label="전체 선택" type="checkbox" /></th><th>환자정보</th><th>검사일시</th><th>검사번호</th><th>검사명</th><th>장비</th><th>STUDY UID</th><th>영상수</th><th>판독상태</th><th>보기</th></tr></thead>
                <tbody>{studies.map((s) => (
                  <tr
                    key={s.studyInstanceUid}
                    className="clickable-row"
                    onClick={() => setDrawerStudy(s)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input aria-label={`${s.patientName} 검사 선택`} type="checkbox" />
                    </td>
                    <td><strong>{s.patientName}</strong><small>{s.patientId}</small></td>
                    <td><strong>{s.studyDate}</strong><small>{s.studyTime}</small></td>
                    <td><strong className="accession">{s.accessionNumber}</strong><small>-</small></td>
                    <td><strong>{s.studyDescription}</strong><small>-</small></td>
                    <td><span className={`modality ${s.modality.replace('-', '').toLowerCase()}`}>{s.modality}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="uid" title={s.studyInstanceUid} type="button" onClick={() => setDrawerStudy(s)}>
                        {s.studyInstanceUid}
                      </button>
                    </td>
                    <td><strong>{s.imageCount}</strong><small>Images</small></td>
                    <td><span className="status"><i />미등록</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="detail-btn"
                        type="button"
                        onClick={() => setDrawerStudy(s)}
                      >
                        상세보기
                      </button>{' '}
                      <button
                        className="viewer"
                        type="button"
                        onClick={() => openViewer(
                          s.studyInstanceUid,
                          s.accessionNumber,
                          s.patientId,
                          undefined,
                          s.orthancStudyId
                        )}
                      >
                        ◫ &nbsp;영상 보기
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {!studies.length && <div className="empty">검색 조건에 맞는 검사가 없습니다.</div>}
              {orthancError && <div className="empty">Orthanc 연결 오류: {orthancError}</div>}
            </div>
            <footer className="pagination"><p>{studies.length ? 1 : 0}–{studies.length} / {studies.length}건</p><div><button disabled>‹</button><button className="current">1</button><button disabled>›</button></div><label>페이지당 <select defaultValue="10"><option>10</option><option>20</option></select></label></footer>
          </section>
          {selectedStudy && <StudyHierarchy key={selectedStudy.orthancStudyId} study={selectedStudy} />}
          {drawerStudy && (
            <StudyDrawer
              study={drawerStudy}
              onClose={() => setDrawerStudy(null)}
              onOpenViewer={openViewer}
            />
          )}
          <p className="prototype">본 화면은 UI 프로토타입이며 실제 의료 진단 목적으로 사용할 수 없습니다.</p>
        </main>
      </div>
    </div>
  );
}
