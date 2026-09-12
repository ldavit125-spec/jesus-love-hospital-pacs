'use client';

import {
  getCurrentUser,
  signInWithEmailPassword,
  signOut as authSignOut,
  roleDisplayLabel,
  type UserProfile,
} from '../lib/supabase/authService';

import { useEffect, useMemo, useState } from 'react';

import { buildViewerUrl, type StudyListItem } from '../lib/orthanc';
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

function SystemStatus({ studies, error, checkedAt, onRefresh }: { studies: StudyListItem[]; error: string; checkedAt: Date | null; onRefresh: () => void }) {
  const value = error ? '조회 실패' : undefined;
  const series = error ? value : studies.reduce((n, s) => n + s.seriesCount, 0);
  const instances = error ? value : studies.reduce((n, s) => n + s.imageCount, 0);
  return <div className="system-page"><div className="heading"><div><p>SYSTEM STATUS</p><h1>시스템</h1><span>현재 PACS 및 Orthanc 연결 상태</span></div><button className="primary" type="button" onClick={onRefresh}>상태 새로고침</button></div><section className="stats"><article><i className="blue">●</i><div><span>PACS Server</span><strong>{error ? '연결 오류' : '정상 연결'}</strong></div></article><article><i className="blue">●</i><div><span>Orthanc 연결</span><strong>{error ? '연결 오류' : '정상 연결'}</strong></div></article></section><section className="study-summary"><div><span>총 Study 수</span><strong>{error ? value : studies.length}</strong></div><div><span>총 Series 수</span><strong>{series}</strong></div><div><span>총 Instance 수</span><strong>{instances}</strong></div><div><span>Storage 사용 가능 여부</span><strong>{error ? '확인 불가' : '사용 가능'}</strong></div><div><span>Orthanc Storage 경로</span><strong>확인 불가</strong></div><div><span>Orthanc DB/Index 경로</span><strong>확인 불가</strong></div><div><span>마지막 확인 시간</span><strong>{checkedAt ? checkedAt.toLocaleString('ko-KR') : '아직 확인하지 않음'}</strong></div><div><span>PACS 버전</span><strong>v1.0.0</strong></div></section>{error && <p className="empty">Orthanc 조회 실패: {error}</p>}</div>;
}

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
    return mod === 'US' || mod === 'ULTRASOUND' || mod.includes('SONO') || desc.includes('SONO')
      || (desc.includes('CARDIAC DOPPLER ULTRASOUND') && study.patientId === 'DEMO-US-ECHO-001');
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
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [loginEmail, setLoginEmail] = useState<string>('admin1');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

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
  const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>([]);
  const [systemOpen, setSystemOpen] = useState(false);
  const [systemCheckedAt, setSystemCheckedAt] = useState<Date | null>(null);

  // Export CSV / CD Package State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCdExportModalOpen, setIsCdExportModalOpen] = useState(false);
  const [isPackaging, setIsPackaging] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packageSuccess, setPackageSuccess] = useState<string | null>(null);

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
    setIsAuthChecking(true);
    getCurrentUser()
      .then((user) => {
        setCurrentUser(user);
      })
      .catch((err) => {
        console.error('[PACS Auth] 세션 확인 실패:', err);
        setCurrentUser(null);
      })
      .finally(() => {
        setIsAuthChecking(false);
      });
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);

    if (!loginEmail.trim()) {
      setLoginError('아이디 또는 이메일을 입력해 주세요.');
      return;
    }
    if (!loginPassword) {
      setLoginError('비밀번호를 입력해 주세요.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const { profile, error } = await signInWithEmailPassword(loginEmail, loginPassword);
      if (error || !profile) {
        setLoginError(error?.message || '로그인에 실패했습니다. 계정 정보를 확인해주세요.');
        return;
      }
      setCurrentUser(profile);
      setLoginPassword('');
      setLoginError(null);
    } catch (err: any) {
      setLoginError(err?.message || '로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authSignOut();
    } catch (err) {
      console.error('로그아웃 오류:', err);
    } finally {
      setCurrentUser(null);
      setLoginPassword('');
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/orthanc/studies')
      .then(async (response) => {
        const result = await response.json() as { studies: StudyListItem[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Orthanc 연결에 실패했습니다.');
        setOrthancStudies(result.studies);
      })
      .catch((error: unknown) => setOrthancError(error instanceof Error ? error.message : 'Orthanc 연결에 실패했습니다.'));
  }, [currentUser]);

  const formattedLocalDate = localDate ? formatLocalDate(localDate) : null;

  const studies = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return orthancStudies.filter((study) => {
      const studyDate = study.studyDate.replaceAll('.', '-');
      const searchable = [
        study.patientId,
        study.patientName,
        study.accessionNumber,
        study.studyInstanceUid,
        study.studyDescription,
        study.modality,
        study.stationName,
      ];
      return (!keyword || searchable.some((value) => (value ?? '').toLowerCase().includes(keyword)))
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
  const allStudiesSelected = studies.length > 0 && studies.every((study) => selectedStudyIds.includes(study.orthancStudyId));

  const toggleAllStudies = (checked: boolean) => {
    setSelectedStudyIds(checked ? studies.map((study) => study.orthancStudyId) : []);
  };

  const toggleStudy = (studyId: string, checked: boolean) => {
    setSelectedStudyIds((current) => checked
      ? (current.includes(studyId) ? current : [...current, studyId])
      : current.filter((id) => id !== studyId));
  };

  const reset = () => {
    setQuery('');
    setSelectedCategory('ALL');
    setEquipment('전체 장비');
    setStatus('전체 상태');
    setFromDate('');
    setToDate('');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  const handleExportCsv = () => {
    if (!studies.length) {
      showToast('내보낼 검사 목록이 없습니다.');
      return;
    }

    const headers = [
      '환자명',
      'Patient ID',
      '검사일',
      '검사시간',
      '검사번호(Accession Number)',
      '검사명(Study Description)',
      'Modality',
      'StudyInstanceUID',
      '영상 수(Image Count)',
    ];

    const rows = studies.map((s) => [
      s.patientName,
      s.patientId,
      s.studyDate,
      s.studyTime,
      s.accessionNumber,
      s.studyDescription,
      s.modality,
      s.studyInstanceUid,
      String(s.imageCount),
    ]);

    const csvLines = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ];

    const bom = '\uFEFF';
    const csvBlob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const filename = `PACS_Study_List_${yyyy}${mm}${dd}.csv`;

    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenCdModal = () => {
    if (selectedStudyIds.length === 0) {
      showToast('먼저 내보낼 검사를 선택해주세요.');
      return;
    }
    setPackageError(null);
    setPackageSuccess(null);
    setIsCdExportModalOpen(true);
  };

  const handleCreateDicomPackage = async () => {
    if (selectedStudyIds.length === 0) {
      setPackageError('선택된 Study가 없습니다.');
      return;
    }

    setIsPackaging(true);
    setPackageError(null);
    setPackageSuccess(null);

    try {
      const response = await fetch('/api/orthanc/export-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyIds: selectedStudyIds }),
      });

      if (!response.ok) {
        const errJson = (await response.json().catch(() => ({}))) as Record<string, any>;
        throw new Error(errJson.error || `서버 응답 오류 (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      let filename = `PACS_EXPORT_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setPackageSuccess('DICOM 패키지가 생성되었습니다.');
    } catch (err: any) {
      setPackageError(err?.message || 'DICOM 패키지 생성에 실패했습니다.');
    } finally {
      setIsPackaging(false);
    }
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

  if (isAuthChecking) {
    return (
      <div className="login-screen-wrapper">
        <div style={{ textAlign: 'center', color: '#ffffff' }}>
          <div className="login-logo-wrap" style={{ width: '64px', height: '64px', marginBottom: '16px' }}>
            <img src="/jesus-love-hospital-logo.png" alt="예수사랑병원 로고" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>예수사랑병원 PACS</h2>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>보안 인증 세션을 확인하는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="login-screen-wrapper">
        <div className="login-card">
          <div className="login-card-header">
            <div className="login-logo-wrap">
              <img src="/jesus-love-hospital-logo.png" alt="예수사랑병원 로고" />
            </div>
            <h2>예수사랑병원</h2>
            <p>JESUS LOVE HOSPITAL PACS</p>
            <span className="login-system-tag">의료영상저장전송시스템 (PACS)</span>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            {loginError && (
              <div className="login-error-box" role="alert">
                <span>⚠ {loginError}</span>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="login-email">아이디 또는 이메일</label>
              <div className="login-input-wrap">
                <input
                  id="login-email"
                  type="text"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin1 또는 admin1@jesuslove.hospital"
                  disabled={isLoggingIn}
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password">비밀번호</label>
              <div className="login-input-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  disabled={isLoggingIn}
                  required
                />
                <button
                  type="button"
                  className="login-toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? '로그인 인증 중...' : '시스템 로그인'}
            </button>

            <div className="login-demo-notice">
              <strong>계정 안내 (Supabase Auth 실제 세션)</strong>
              · 관리자: <code>admin1</code> (또는 <code>admin1@jesuslove.hospital</code>) / <code>admin01</code><br />
              · 방사선사 (이지훈): <code>radiographer@jesuslove.hospital</code><br />
              · 영상의학과 전문의 (장태성): <code>radiologist@jesuslove.hospital</code><br />
              <small style={{ color: '#64748b' }}>* 허용 권한: rt, radiologist, admin (그 외 접근 불가)</small>
            </div>

            <div className="login-footer-security">
              <span>🔒 256-bit SSL 암호화 보안 세션 연동</span>
            </div>
          </form>
        </div>
      </div>
    );
  }

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
                    onClick={() => { setSystemOpen(false); setIsStudyListOpen((prev) => !prev); }}
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
              <button key={label} type="button" className={systemOpen ? 'active' : ''} onClick={() => setSystemOpen(true)}>
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
          <div className="user">
            <div className="user-profile-group">
              <span className="avatar">{currentUser.initial}</span>
              <div className="user-info">
                <strong>{currentUser.name}</strong>
                <small>{roleDisplayLabel(currentUser.role)} · {currentUser.department}</small>
              </div>
            </div>
            <button
              type="button"
              className="logout-btn"
              onClick={handleSignOut}
              title="PACS 시스템 로그아웃"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>로그아웃</span>
            </button>
          </div>
        </header>

        <main className="content">
          {systemOpen ? <SystemStatus studies={orthancStudies} error={orthancError} checkedAt={systemCheckedAt} onRefresh={async () => { try { const r = await fetch('/api/orthanc/studies', { cache: 'no-store' }); const d = (await r.json()) as any; if (!r.ok) throw new Error(d.error || '조회 실패'); setOrthancStudies(d.studies || []); setOrthancError(''); } catch (e) { setOrthancError(e instanceof Error ? e.message : '조회 실패'); } finally { setSystemCheckedAt(new Date()); } }} /> : <>
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
              <label><span>판독상태</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option>전체 상태</option></select></label>
              <button className="search-btn" type="button">⌕ &nbsp;조회</button>
            </div>
          </section>

          <section className="table-card">
            <header className="table-tools">
              <div>
                <h2>검사 목록</h2>
                <span>총 <strong>{studies.length}</strong>건</span>
              </div>
              <div>
                <button type="button" onClick={handleExportCsv}>⇩ 목록 내보내기</button>
                <button className="add" type="button" onClick={handleOpenCdModal}>▣ 환자용 CD/DVD 내보내기</button>
              </div>
            </header>
            <div className="table-scroll">
              <table>
                <thead><tr><th><input aria-label="전체 선택" type="checkbox" checked={allStudiesSelected} onChange={(event) => toggleAllStudies(event.target.checked)} /></th><th>환자정보</th><th>검사일시</th><th>검사번호</th><th>검사명</th><th>장비</th><th>STUDY UID</th><th>영상수</th><th>판독상태</th><th>보기</th></tr></thead>
                <tbody>{studies.map((s) => (
                  <tr key={s.studyInstanceUid}>
                    <td>
                      <input aria-label={`${s.patientName} 검사 선택`} type="checkbox" checked={selectedStudyIds.includes(s.orthancStudyId)} onChange={(event) => toggleStudy(s.orthancStudyId, event.target.checked)} />
                    </td>
                    <td><strong>{s.patientName}</strong><small>{s.patientId}</small></td>
                    <td><strong>{s.studyDate}</strong><small>{s.studyTime}</small></td>
                    <td><strong className="accession">{s.accessionNumber}</strong><small>-</small></td>
                    <td><strong>{s.studyDescription}</strong><small>-</small></td>
                    <td><span className={`modality ${s.modality.replace('-', '').toLowerCase()}`}>{s.studyDescription === 'Synthetic Chest X-ray Demo' ? 'CR Demo' : s.studyDescription === 'Synthetic Mammography Demo' ? 'MG Demo' : s.studyDescription === 'Synthetic C-arm Lumbar Procedure Demo' && s.patientId === 'DEMO-CARM-001' ? 'C-arm Demo' : s.studyDescription === 'Synthetic Cardiac Doppler Ultrasound Demo' && s.patientId === 'DEMO-US-ECHO-001' ? 'US Demo' : s.studyDescription === 'Synthetic Liver CT 3-Phase Demo' && s.patientId === 'DEMO-CT-LIVER-001' ? 'CT Demo' : s.modality}</span></td>
                    <td>
                      <span className="uid" title={s.studyInstanceUid}>
                        {s.studyInstanceUid}
                      </span>
                    </td>
                    <td><strong>{s.imageCount}</strong><small>Images</small></td>
                    <td><span className="status"><i />미등록</span></td>
                    <td>
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

          {isCdExportModalOpen && (() => {
            const selectedStudiesList = orthancStudies.filter((s) => selectedStudyIds.includes(s.orthancStudyId));
            const uniquePatientNames = Array.from(new Set(selectedStudiesList.map((s) => s.patientName)));
            const isMultiPatient = uniquePatientNames.length > 1;

            return (
              <div className="export-modal-overlay" onClick={() => !isPackaging && setIsCdExportModalOpen(false)}>
                <div className="export-modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="export-modal-header">
                    <h3>
                      <span>▣</span>
                      환자용 CD/DVD 미디어 내보내기
                    </h3>
                    <button
                      type="button"
                      className="close-btn"
                      disabled={isPackaging}
                      onClick={() => setIsCdExportModalOpen(false)}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="export-modal-body">
                    <div className="export-notice-banner">
                      <strong>안내사항</strong>
                      <p>
                        본 기능은 환자용 DICOM 미디어 패키지를 생성합니다.<br />
                        실제 CD/DVD 기록은 전용 미디어 기록 프로그램 또는 운영체제의 디스크 기록 기능을 사용합니다.
                      </p>
                    </div>

                    {isMultiPatient && (
                      <div className="multi-patient-warning">
                        <span>⚠️</span>
                        <span>
                          서로 다른 환자 <strong>{uniquePatientNames.length}명</strong>의 검사가 선택되었습니다. 환자별 구분에 주의하시기 바랍니다.
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                        내보낼 검사 목록 (총 {selectedStudiesList.length}건)
                      </span>
                    </div>

                    <div className="export-studies-table-wrap">
                      <table className="export-studies-table">
                        <thead>
                          <tr>
                            <th>환자명</th>
                            <th>Patient ID</th>
                            <th>검사명</th>
                            <th>검사일</th>
                            <th>장비</th>
                            <th style={{ textAlign: 'right' }}>영상수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedStudiesList.map((st) => (
                            <tr key={st.orthancStudyId}>
                              <td><strong>{st.patientName}</strong></td>
                              <td>{st.patientId}</td>
                              <td>{st.studyDescription}</td>
                              <td>{st.studyDate}</td>
                              <td><span className="modality">{st.modality}</span></td>
                              <td style={{ textAlign: 'right' }}>{st.imageCount}장</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {packageSuccess && (
                      <div className="export-status-message success">
                        ✓ {packageSuccess}
                      </div>
                    )}
                    {packageError && (
                      <div className="export-status-message error">
                        ✕ {packageError}
                      </div>
                    )}
                  </div>

                  <div className="export-modal-footer">
                    <button
                      type="button"
                      className="cancel-btn"
                      disabled={isPackaging}
                      onClick={() => setIsCdExportModalOpen(false)}
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      className="action-btn"
                      disabled={isPackaging || selectedStudiesList.length === 0}
                      onClick={handleCreateDicomPackage}
                    >
                      {isPackaging ? (
                        <>
                          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                          패키지 생성 중...
                        </>
                      ) : (
                        'DICOM 패키지 생성'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {toastMessage && (
            <div className="toast" style={{ zIndex: 100000 }}>
              <i>i</i>
              <span>{toastMessage}</span>
            </div>
          )}

          <p className="prototype">본 화면은 UI 프로토타입이며 실제 의료 진단 목적으로 사용할 수 없습니다.</p></>}
        </main>
      </div>
    </div>
  );
}
