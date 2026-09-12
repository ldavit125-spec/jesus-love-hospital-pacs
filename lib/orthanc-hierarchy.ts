import { fetchOrthanc } from './orthanc';

export type SeriesItem = {
  orthancSeriesId: string;
  orthancStudyId: string;
  modality: string | null;
  seriesDescription: string | null;
  seriesInstanceUid: string | null;
  seriesNumber: string | null;
  instanceCount: number;
};

export type InstanceItem = {
  orthancInstanceId: string;
  orthancSeriesId: string;
  sopInstanceUid: string | null;
  instanceNumber: string | null;
};

type Resource = {
  ID: string;
  ParentStudy?: string;
  ParentSeries?: string;
  Series?: string[];
  Instances?: string[];
  MainDicomTags?: Record<string, string>;
};

export class HierarchyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function resourceId(id: string | null): string {
  if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{8}){4}$/.test(id)) {
    throw new HierarchyError('유효한 Orthanc ID가 필요합니다.', 400);
  }
  return id;
}

async function read(path: string): Promise<Resource> {
  const response = await fetchOrthanc(path, { cache: 'no-store' });
  if (!response.ok) throw new HierarchyError(`Orthanc ${path}: HTTP ${response.status}`, response.status === 404 ? 404 : 502);
  return response.json();
}

const tag = (resource: Resource, name: string) => resource.MainDicomTags?.[name]?.trim() || null;

export async function getStudySeries(studyId: string): Promise<SeriesItem[]> {
  const study = await read(`/studies/${resourceId(studyId)}`);
  return Promise.all((study.Series ?? []).map(async (id) => {
    const series = await read(`/series/${resourceId(id)}`);
    if (series.ParentStudy !== studyId) throw new HierarchyError('Study / Series 관계가 일치하지 않습니다.', 502);
    return {
      orthancSeriesId: series.ID, orthancStudyId: series.ParentStudy,
      modality: tag(series, 'Modality'), seriesDescription: tag(series, 'SeriesDescription'),
      seriesInstanceUid: tag(series, 'SeriesInstanceUID'), seriesNumber: tag(series, 'SeriesNumber'),
      instanceCount: (series.Instances ?? []).length,
    };
  }));
}

export async function getSeriesInstances(studyId: string, seriesId: string): Promise<InstanceItem[]> {
  const study = await read(`/studies/${resourceId(studyId)}`);
  resourceId(seriesId);
  if (!study.Series?.includes(seriesId)) throw new HierarchyError('선택한 Study에 속한 Series가 아닙니다.', 404);
  const series = await read(`/series/${seriesId}`);
  if (series.ParentStudy !== studyId) throw new HierarchyError('Study / Series 관계가 일치하지 않습니다.', 502);
  return Promise.all((series.Instances ?? []).map(async (id) => {
    const instance = await read(`/instances/${resourceId(id)}`);
    if (instance.ParentSeries !== seriesId) throw new HierarchyError('Series / Instance 관계가 일치하지 않습니다.', 502);
    return {
      orthancInstanceId: instance.ID, orthancSeriesId: instance.ParentSeries,
      sopInstanceUid: tag(instance, 'SOPInstanceUID'), instanceNumber: tag(instance, 'InstanceNumber'),
    };
  }));
}

export function hierarchyFailure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : 'Orthanc 조회 실패' }, {
    status: error instanceof HierarchyError ? error.status : 503,
  });
}
