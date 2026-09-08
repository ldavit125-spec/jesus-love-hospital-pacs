'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PACS_STUDIES, type Modality, type ReadingStatus } from './pacs-data';

const menuItems = [
  ['▦', 'Dashboard'], ['▤', 'Study List'], ['◫', 'DICOM Viewer'], ['⚙', 'System'],
] as const;
const statusLabels: Record<ReadingStatus, string> = { unread: '미판독', reading: '판독중', completed: '판독완료' };
const modalityOptions: Array<Modality | '전체 장비'> = ['전체 장비', 'CT', 'MRI', 'X-ray', 'Ultrasound', 'Mammography', 'C-arm'];
const koreanWeekdays = ['일', '월', '화', '수', '목', '금', '토'];

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { date: `${year}. ${month}. ${day}`, weekday: `${koreanWeekdays[date.getDay()]}요일` };
}

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [modality, setModality] = useState<(typeof modalityOptions)[number]>('전체 장비');
  const [status, setStatus] = useState<ReadingStatus | '전체 상태'>('전체 상태');
  const [fromDate, setFromDate] = useState('2025-04-01');
  const [toDate, setToDate] = useState('');
  const [localDate, setLocalDate] = useState<Date | null>(null);

  useEffect(() => {
    let midnightTimer: number;
    const updateDate = () => {
      const now = new Date();
      setLocalDate(now);
      setToDate(toLocalDateInputValue(now));
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      midnightTimer = window.setTimeout(updateDate, nextMidnight.getTime() - now.getTime());
    };
    updateDate();
    return () => window.clearTimeout(midnightTimer);
  }, []);

  const formattedLocalDate = localDate ? formatLocalDate(localDate) : null;

  const studies = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return PACS_STUDIES.filter((study) => {
      const searchable = [study.patientId, study.patientName, study.examId, study.accessionNumber];
      return (!keyword || searchable.some((value) => value.toLowerCase().includes(keyword)))
        && (modality === '전체 장비' || study.modality === modality)
        && (status === '전체 상태' || study.readingStatus === status);
    });
  }, [query, modality, status]);

  const reset = () => {
    setQuery(''); setModality('전체 장비'); setStatus('전체 상태');
    setFromDate('2025-04-01'); setToDate(toLocalDateInputValue(new Date()));
  };
  const openViewer = (studyInstanceUid: string, accessionNumber?: string, patientId?: string) => {
    const params = new URLSearchParams({
      studyInstanceUid,
      ...(accessionNumber ? { accessionNumber } : {}),
      ...(patientId ? { patientId } : {}),
    });
    window.open(`http://localhost:5174/?${params.toString()}`, '_blank');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><img src="/jesus-love-hospital-logo.png" alt="예수사랑병원 로고" /></div><div><strong>예수사랑병원</strong><span>JESUS LOVE HOSPITAL</span></div></div>
        <nav aria-label="주 메뉴">
          <p>PACS MENU</p>
          {menuItems.map(([icon, label]) => <button key={label} type="button" className={label === 'Study List' ? 'active' : ''}><i>{icon}</i><span>{label}</span>{label === 'Study List' && <b>›</b>}</button>)}
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
            <article><i className="blue">▤</i><div><span>전체 검사</span><strong>1,248<small> 건</small></strong></div><em>이번 달 +124</em></article>
            <article><i className="amber">◷</i><div><span>미판독</span><strong>24<small> 건</small></strong></div><em className="urgent">확인 필요</em></article>
            <article><i className="purple">◉</i><div><span>판독중</span><strong>8<small> 건</small></strong></div><em>진행 중</em></article>
            <article><i className="green">✓</i><div><span>판독완료</span><strong>1,216<small> 건</small></strong></div><em>97.4%</em></article>
          </section>

          <section className="filter-panel">
            <header><h2>검사 검색</h2><button type="button" onClick={reset}>↻ 조건 초기화</button></header>
            <div className="filters">
              <label><span>검색어</span><div className="input"><b>⌕</b><input placeholder="환자명, 환자번호, 검사번호" value={query} onChange={(e) => setQuery(e.target.value)} /></div></label>
              <label><span>검사일</span><div className="dates"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /><i>—</i><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div></label>
              <label><span>장비</span><select value={modality} onChange={(e) => setModality(e.target.value as typeof modality)}>{modalityOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>판독상태</span><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option>전체 상태</option><option value="unread">미판독</option><option value="reading">판독중</option><option value="completed">판독완료</option></select></label>
              <button className="search-btn" type="button">⌕ &nbsp;조회</button>
            </div>
          </section>

          <section className="table-card">
            <header className="table-tools"><div><h2>검사 목록</h2><span>총 <strong>{studies.length}</strong>건</span></div><div><button type="button">⇩ 목록 내보내기</button><button className="add" type="button">＋ 검사 등록</button></div></header>
            <div className="table-scroll">
              <table>
                <thead><tr><th><input aria-label="전체 선택" type="checkbox" /></th><th>환자정보</th><th>검사일시</th><th>검사번호</th><th>검사명</th><th>장비</th><th>STUDY UID</th><th>영상수</th><th>판독상태</th><th>보기</th></tr></thead>
                <tbody>{studies.map((s) => <tr key={s.studyInstanceUid}>
                  <td><input aria-label={`${s.patientName} 검사 선택`} type="checkbox" /></td>
                  <td><strong>{s.patientName}</strong><small>{s.patientId}</small></td>
                  <td><strong>{s.studyDate}</strong><small>{s.studyTime}</small></td>
                  <td><strong className="accession">{s.accessionNumber}</strong><small>{s.examId}</small></td>
                  <td><strong>{s.studyDescription}</strong><small>{s.bodyPart}</small></td>
                  <td><span className={`modality ${s.modality.replace('-', '').toLowerCase()}`}>{s.modality}</span></td>
                  <td><button className="uid" title={s.studyInstanceUid} type="button">{s.studyInstanceUid}</button></td>
                  <td><strong>{s.imageCount}</strong><small>Images</small></td>
                  <td><span className={`status ${s.readingStatus}`}><i />{statusLabels[s.readingStatus]}</span></td>
                  <td><button className="viewer" type="button" onClick={() => openViewer(s.studyInstanceUid, s.accessionNumber, s.patientId)}>◫ &nbsp;영상 보기</button></td>
                </tr>)}</tbody>
              </table>
              {!studies.length && <div className="empty">검색 조건에 맞는 검사가 없습니다.</div>}
            </div>
            <footer className="pagination"><p>1–{studies.length} / {studies.length}건</p><div><button disabled>‹</button><button className="current">1</button><button disabled>›</button></div><label>페이지당 <select defaultValue="10"><option>10</option><option>20</option></select></label></footer>
          </section>
          <p className="prototype">본 화면은 UI 프로토타입이며 실제 의료 진단 목적으로 사용할 수 없습니다.</p>
        </main>
      </div>
    </div>
  );
}
