'use client';

import { useEffect, useState } from 'react';
import type { StudyListItem } from '../lib/orthanc';
import type { InstanceItem, SeriesItem } from '../lib/orthanc-hierarchy';

interface StudyDrawerProps {
  study: StudyListItem;
  onClose: () => void;
  onOpenViewer: (
    studyInstanceUid: string,
    accessionNumber?: string,
    patientId?: string,
    seriesInstanceUid?: string,
    orthancStudyId?: string,
    orthancSeriesId?: string
  ) => void;
}

function useOrthancList<T>(url: string, field: string) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string }>({
    items: [],
    loading: true,
    error: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as Record<string, unknown>;
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Orthanc 조회 실패');
        if (!Array.isArray(result[field])) throw new Error('Orthanc 목록 응답이 올바르지 않습니다.');
        if (!controller.signal.aborted) setState({ items: result[field] as T[], loading: false, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            items: [],
            loading: false,
            error: error instanceof Error ? error.message : 'Orthanc 조회 실패',
          });
        }
      });
    return () => controller.abort();
  }, [url, field]);

  return state;
}

export default function StudyDrawer({ study, onClose, onOpenViewer }: StudyDrawerProps) {
  const displayModality = study.studyDescription === 'Synthetic Cardiac Doppler Ultrasound Demo' && study.patientId === 'DEMO-US-ECHO-001'
    ? 'US Demo'
    : study.studyDescription === 'Synthetic Chest X-ray Demo'
    ? 'CR Demo'
    : study.studyDescription === 'Synthetic Mammography Demo'
      ? 'MG Demo'
      : study.studyDescription === 'Synthetic C-arm Lumbar Procedure Demo' && study.patientId === 'DEMO-CARM-001'
        ? 'C-arm Demo'
      : study.modality || '-';
  const displayEquipment = study.studyDescription === 'Synthetic Cardiac Doppler Ultrasound Demo' && study.patientId === 'DEMO-US-ECHO-001'
    ? 'US Demo'
    : study.studyDescription === 'Synthetic Chest X-ray Demo'
    ? 'CR Demo'
    : study.studyDescription === 'Synthetic Mammography Demo'
      ? 'MG Demo'
      : study.studyDescription === 'Synthetic C-arm Lumbar Procedure Demo' && study.patientId === 'DEMO-CARM-001'
        ? 'C-arm Demo'
      : study.stationName || '-';
  const [reportText, setReportText] = useState('');
  const [reportSaved, setReportSaved] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(`pacs-report-${study.orthancStudyId}`);
    setReportText(saved || '');
    setReportSaved(Boolean(saved));
  }, [study.orthancStudyId]);

  const saveReport = () => {
    window.localStorage.setItem(`pacs-report-${study.orthancStudyId}`, reportText);
    setReportSaved(true);
  };

  const { items: seriesList, loading, error } = useOrthancList<SeriesItem>(
    `/api/orthanc/series?${new URLSearchParams({ studyId: study.orthancStudyId })}`,
    'series'
  );

  const totalInstances = seriesList.reduce((acc, cur) => acc + (cur.instanceCount || 0), 0);

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Study 상세정보">
      <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-header">
          <div>
            <span className="drawer-badge">Study Detail</span>
            <h2>검사 상세정보</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="닫기">✕</button>
        </header>

        <div className="drawer-content">
          {/* Study 상세정보 */}
          <section className="drawer-section">
            <h3 className="drawer-section-title">기본 검사 정보</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">환자명</span>
                <strong className="detail-value">{study.patientName || '-'}</strong>
              </div>
              <div className="detail-item">
                <span className="detail-label">Patient ID</span>
                <strong className="detail-value">{study.patientId || '-'}</strong>
              </div>
              <div className="detail-item">
                <span className="detail-label">Study Date / Time</span>
                <strong className="detail-value">
                  {study.studyDate && study.studyDate !== '-' ? `${study.studyDate} ${study.studyTime && study.studyTime !== '-' ? study.studyTime : ''}`.trim() : '-'}
                </strong>
              </div>
              <div className="detail-item">
                <span className="detail-label">Accession Number</span>
                <strong className="detail-value">{study.accessionNumber || '-'}</strong>
              </div>
              <div className="detail-item full-width">
                <span className="detail-label">Study Description</span>
                <strong className="detail-value">{study.studyDescription || '-'}</strong>
              </div>
              <div className="detail-item full-width">
                <span className="detail-label">StudyInstanceUID</span>
                <strong className="detail-value mono" title={study.studyInstanceUid}>{study.studyInstanceUid || '-'}</strong>
              </div>
              <div className="detail-item">
                <span className="detail-label">Modality</span>
                <strong className="detail-value">
                  <span className={`modality ${study.modality ? study.modality.replace('-', '').toLowerCase() : ''}`}>
                    {displayModality}
                  </span>
                </strong>
              </div>
              <div className="detail-item">
                <span className="detail-label">장비</span>
                <strong className="detail-value">{displayEquipment}</strong>
              </div>
              <div className="detail-item">
                <span className="detail-label">Series 수</span>
                <strong className="detail-value">{loading ? '-' : `${seriesList.length}개`}</strong>
              </div>
              <div className="detail-item">
                <span className="detail-label">전체 Instance 수</span>
                <strong className="detail-value">{loading ? (study.imageCount ? `${study.imageCount}개` : '-') : `${totalInstances || study.imageCount || 0}개`}</strong>
              </div>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-header">
              <h3 className="drawer-section-title">판독문</h3>
              {reportSaved && <span className="detail-label">저장됨</span>}
            </div>
            <textarea
              aria-label="판독문 입력"
              value={reportText}
              onChange={(event) => { setReportText(event.target.value); setReportSaved(false); }}
              placeholder="판독문을 입력하세요."
              rows={6}
              style={{ width: '100%', resize: 'vertical', padding: '10px', border: '1px solid #dce4ec', borderRadius: '6px', font: 'inherit' }}
            />
            <button type="button" className="viewer-btn" onClick={saveReport} style={{ marginTop: '8px' }}>
              판독문 저장
            </button>
          </section>

          {/* Series 목록 */}
          <section className="drawer-section">
            <div className="drawer-section-header">
              <h3 className="drawer-section-title">Series 목록 ({seriesList.length})</h3>
            </div>

            {loading ? (
              <p className="empty" role="status">Series 조회 중…</p>
            ) : error ? (
              <p className="empty" role="alert">{error}</p>
            ) : seriesList.length === 0 ? (
              <p className="empty">등록된 Series가 없습니다.</p>
            ) : (
              <div className="series-list">
                {seriesList.map((series) => (
                  <article key={series.orthancSeriesId} className="series-card">
                    <div className="series-card-header">
                      <div className="series-meta">
                        <span className="series-num">Series #{series.seriesNumber || '-'}</span>
                        <span className={`modality ${series.modality ? series.modality.replace('-', '').toLowerCase() : ''}`}>
                          {displayModality}
                        </span>
                        <span className="instance-badge">{series.instanceCount} Instances</span>
                      </div>
                      <button
                        type="button"
                        className="viewer-btn"
                        onClick={() => onOpenViewer(
                          study.studyInstanceUid,
                          study.accessionNumber,
                          study.patientId,
                          series.seriesInstanceUid || undefined,
                          study.orthancStudyId,
                          series.orthancSeriesId
                        )}
                      >
                        ◫ 영상 보기
                      </button>
                    </div>

                    <div className="series-details">
                      <div className="series-prop">
                        <span>Series Description:</span>
                        <strong>{series.seriesDescription || '-'}</strong>
                      </div>
                      <div className="series-prop">
                        <span>SeriesInstanceUID:</span>
                        <strong className="mono" title={series.seriesInstanceUid || '-'}>
                          {series.seriesInstanceUid || '-'}
                        </strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
