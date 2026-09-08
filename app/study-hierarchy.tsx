'use client';

import { useEffect, useState } from 'react';
import { buildViewerUrl, type StudyListItem } from '../lib/orthanc';
import type { InstanceItem, SeriesItem } from '../lib/orthanc-hierarchy';

function useOrthancList<T>(url: string, field: string) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string }>({ items: [], loading: true, error: '' });
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
        if (!controller.signal.aborted) setState({ items: [], loading: false, error: error instanceof Error ? error.message : 'Orthanc 조회 실패' });
      });
    return () => controller.abort();
  }, [url, field]);
  return state;
}

function viewerUrl(study: StudyListItem, series: SeriesItem, instance?: InstanceItem) {
  return buildViewerUrl({
    studyInstanceUid: study.studyInstanceUid,
    orthancStudyId: study.orthancStudyId,
    patientId: study.patientId,
    accessionNumber: study.accessionNumber,
    seriesInstanceUid: series.seriesInstanceUid || undefined,
    orthancSeriesId: series.orthancSeriesId,
    sopInstanceUid: instance?.sopInstanceUid || undefined,
    orthancInstanceId: instance?.orthancInstanceId || undefined,
  });
}

function Instances({ study, series }: { study: StudyListItem; series: SeriesItem }) {
  const { items, loading, error } = useOrthancList<InstanceItem>(
    `/api/orthanc/instances?${new URLSearchParams({ studyId: study.orthancStudyId, seriesId: series.orthancSeriesId })}`, 'instances',
  );
  return <section className="table-card" aria-label="Instance 목록">
    <header className="table-tools"><div><h2>Instance 목록</h2><span>{items.length}건</span></div></header>
    <p className="hierarchy-context">SeriesInstanceUID: {series.seriesInstanceUid ?? '미등록'}</p>
    {loading ? <p className="empty" role="status">Instance 조회 중…</p> : error ? <p className="empty" role="alert">{error}</p> : <>
      <div className="table-scroll"><table><thead><tr><th>SOPInstanceUID</th><th>Instance Number</th><th>Orthanc Instance ID</th><th>보기</th></tr></thead>
        <tbody>{items.map((instance) => <tr key={instance.orthancInstanceId}>
          <td>{instance.sopInstanceUid ?? '미등록'}</td><td>{instance.instanceNumber ?? '미등록'}</td><td>{instance.orthancInstanceId}</td>
          <td><a className="viewer" href={viewerUrl(study, series, instance)} target="_blank" rel="noopener noreferrer">영상 보기</a></td>
        </tr>)}</tbody></table></div>
      {!items.length && <p className="empty">이 Series에 등록된 Instance가 없습니다.</p>}
    </>}
  </section>;
}

export default function StudyHierarchy({ study }: { study: StudyListItem }) {
  const { items, loading, error } = useOrthancList<SeriesItem>(`/api/orthanc/series?${new URLSearchParams({ studyId: study.orthancStudyId })}`, 'series');
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  return <div className="study-hierarchy">
    <section className="table-card" aria-label="Series 목록">
      <header className="table-tools"><div><h2>Series 목록</h2><span>{items.length}건</span></div></header>
      <p className="hierarchy-context">StudyInstanceUID: {study.studyInstanceUid}</p>
      {loading ? <p className="empty" role="status">Series 조회 중…</p> : error ? <p className="empty" role="alert">{error}</p> : <>
        <div className="table-scroll"><table><thead><tr><th>선택</th><th>Modality</th><th>Series Description</th><th>SeriesInstanceUID</th><th>Series Number</th><th>Instance 수</th><th>보기</th></tr></thead>
          <tbody>{items.map((series) => <tr key={series.orthancSeriesId} aria-selected={selectedSeries?.orthancSeriesId === series.orthancSeriesId}>
            <td><button className="viewer" type="button" aria-pressed={selectedSeries?.orthancSeriesId === series.orthancSeriesId} onClick={() => setSelectedSeries(series)}>Series 선택</button></td>
            <td>{series.modality ?? '미등록'}</td><td>{series.seriesDescription ?? '미등록'}</td><td>{series.seriesInstanceUid ?? '미등록'}</td>
            <td>{series.seriesNumber ?? '미등록'}</td><td>{series.instanceCount}</td>
            <td><a className="viewer" href={viewerUrl(study, series)} target="_blank" rel="noopener noreferrer">영상 보기</a></td>
          </tr>)}</tbody></table></div>
        {!items.length && <p className="empty">이 Study에 등록된 Series가 없습니다.</p>}
      </>}
    </section>
    {selectedSeries && <Instances key={selectedSeries.orthancSeriesId} study={study} series={selectedSeries} />}
  </div>;
}
