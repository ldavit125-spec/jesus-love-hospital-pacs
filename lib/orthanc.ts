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
const orthancUsername = process.env.ORTHANC_USERNAME;
const orthancPassword = process.env.ORTHANC_PASSWORD;

export function getOrthancHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (orthancUsername && orthancPassword) {
    const credentials = Buffer.from(`${orthancUsername}:${orthancPassword}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }
  return headers;
}

export async function fetchOrthanc(urlOrPath: string, init?: RequestInit): Promise<Response> {
  const fullUrl = urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')
    ? urlOrPath
    : `${orthancUrl}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;

  const authHeaders = getOrthancHeaders();
  const mergedHeaders = {
    ...authHeaders,
    ...(init?.headers as Record<string, string> | undefined),
  };

  return fetch(fullUrl, {
    ...init,
    headers: mergedHeaders,
  });
}

// Portfolio display classification only. The source DICOM Study/Series tags remain untouched in Orthanc; this label must not be interpreted as a phase diagnosis.
const HCC_004_STUDY_UID = '1.3.6.1.4.1.14519.5.2.1.1706.8374.181961287094258156999595854067';
const HCC_004_DISPLAY_NAME = 'Contrast-enhanced Abdomen/Liver CT';

function value(tags: Record<string, string> | undefined, key: string) {
  return tags?.[key]?.trim() || '-';
}

export function formatPatientName(rawName?: string | null): string {
  if (!rawName || rawName === '-') return '-';
  const trimmed = rawName.trim();
  if (trimmed.toUpperCase() === 'JEONG^HYEONWOO' || trimmed.toUpperCase() === 'JEONG HYEONWOO') {
    return 'JEONG HYEON WOO';
  }
  return trimmed.replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim();
}

function date(value: string) {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}` : '-';
}

function time(value: string) {
  return /^\d{4,}$/.test(value) ? `${value.slice(0, 2)}:${value.slice(2, 4)}` : '-';
}

export async function getOrthancStudies(): Promise<StudyListItem[]> {
  const ids = await fetchOrthanc('/studies', { cache: 'no-store' }).then((response) => {
    if (!response.ok) {
      throw new Error(`Orthanc /studies 조회 실패 (HTTP ${response.status})`);
    }
    return response.json() as Promise<string[]>;
  });
  const studies = await Promise.all(
    ids.map((id) =>
      fetchOrthanc(`/studies/${id}`, { cache: 'no-store' }).then((response) => {
        if (!response.ok) {
          throw new Error(`Orthanc /studies/${id} 조회 실패 (HTTP ${response.status})`);
        }
        return response.json() as Promise<OrthancStudy>;
      })
    )
  );

  const results = await Promise.all(
    studies.map(async (study) => {
      const series = await Promise.all(
        (study.Series ?? []).map((id) =>
          fetchOrthanc(`/series/${id}`, { cache: 'no-store' }).then((response) => {
            if (!response.ok) {
              throw new Error(`Orthanc /series/${id} 조회 실패 (HTTP ${response.status})`);
            }
            return response.json() as Promise<OrthancSeries>;
          })
        )
      );
      const tags = study.MainDicomTags;
      const firstSeries = series[0];
      let studyDescription = value(tags, 'StudyDescription');

      // Map THORAX or empty description to standard clinical name 'Chest PA' using BodyPart / ViewPosition tags
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

      return {
        orthancStudyId: study.ID,
        patientId: value(study.PatientMainDicomTags, 'PatientID'),
        patientName: formatPatientName(value(study.PatientMainDicomTags, 'PatientName')),
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
    })
  );

  // Ensure required studies are present
  const finalResults = results.slice();
  // HCC_004 placeholder (if not already present via UID mapping)
  if (!finalResults.find((s) => s.studyInstanceUid === HCC_004_STUDY_UID)) {
    finalResults.push({
      orthancStudyId: 'placeholder-hcc004',
      patientId: 'UNKNOWN',
      patientName: 'UNKNOWN',
      accessionNumber: '-',
      studyInstanceUid: HCC_004_STUDY_UID,
      studyDate: '-',
      studyTime: '-',
      studyDescription: HCC_004_DISPLAY_NAME,
      modality: '-',
      stationName: '-',
      seriesCount: 0,
      imageCount: 0,
      readingStatus: null,
    });
  }
  return finalResults;
}

export function buildViewerUrl(params: { [key: string]: string }): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== '-' && value !== 'undefined' && value !== 'null') {
      q.set(key, value);
    }
  }
  return `http://localhost:5174/?${q.toString()}`;
}
