export type OrthancStudy = {
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

export type StudyListItem = {
  orthancStudyId: string;
  patientId: string;
  patientName: string;
  accessionNumber: string;
  studyInstanceUid: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  modality: string;
  stationName?: string;
  seriesCount: number;
  imageCount: number;
  readingStatus: null;
};

export const orthancUrl = process.env.ORTHANC_URL ?? 'http://localhost:8042';

function value(tags: Record<string, string> | undefined, key: string) {
  return tags?.[key]?.trim() || '-';
}

function date(value: string) {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}` : '-';
}

function time(value: string) {
  return /^\d{4,}$/.test(value) ? `${value.slice(0, 2)}:${value.slice(2, 4)}` : '-';
}

export async function getOrthancStudies(): Promise<StudyListItem[]> {
  const ids = await fetch(`${orthancUrl}/studies`, { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error(`Orthanc /studies returned ${response.status}`);
    return response.json() as Promise<string[]>;
  });
  const studies = await Promise.all(ids.map((id) => fetch(`${orthancUrl}/studies/${id}`, { cache: 'no-store' }).then((response) => response.json() as Promise<OrthancStudy>)));

  return Promise.all(studies.map(async (study) => {
    const series = await Promise.all((study.Series ?? []).map((id) => fetch(`${orthancUrl}/series/${id}`, { cache: 'no-store' }).then((response) => response.json() as Promise<OrthancSeries>)));
    const tags = study.MainDicomTags;
    const firstSeries = series[0];
    let studyDescription = value(tags, 'StudyDescription');

    // DICOM 태그가 THORAX이거나 비어있는 경우, BodyPart / ViewPosition 태그를 확인하여 표준 임상 검사명 'Chest PA'로 매핑
    if (studyDescription === '-' || studyDescription.toUpperCase() === 'THORAX') {
      if (firstSeries?.Instances?.[0]) {
        try {
          const instTagsResp = await fetch(`${orthancUrl}/instances/${firstSeries.Instances[0]}/simplified-tags`, { cache: 'no-store' });
          if (instTagsResp.ok) {
            const instTags = await instTagsResp.json() as Record<string, string>;
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

    return {
      orthancStudyId: study.ID,
      patientId: value(study.PatientMainDicomTags, 'PatientID'),
      patientName: value(study.PatientMainDicomTags, 'PatientName'),
      accessionNumber: value(tags, 'AccessionNumber'),
      studyInstanceUid: value(tags, 'StudyInstanceUID'),
      studyDate: date(value(tags, 'StudyDate')),
      studyTime: time(value(tags, 'StudyTime')),
      studyDescription: studyDescription,
      modality: series.map((item) => value(item.MainDicomTags, 'Modality')).find((item) => item !== '-') ?? '-',
      stationName: series.map((item) => value(item.MainDicomTags, 'StationName')).find((item) => item !== '-') ?? '-',
      seriesCount: series.length,
      imageCount: series.reduce((total, item) => total + (item.Instances?.length ?? 0), 0),
      readingStatus: null,
    };
  }));
}

export function buildViewerUrl(params: {
  studyInstanceUid: string;
  orthancStudyId?: string;
  accessionNumber?: string;
  patientId?: string;
  seriesInstanceUid?: string;
  orthancSeriesId?: string;
  sopInstanceUid?: string;
  orthancInstanceId?: string;
}): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== '-' && value !== 'undefined' && value !== 'null') {
      q.set(key, value);
    }
  }
  return `http://localhost:5174/?${q.toString()}`;
}

