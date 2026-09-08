export type Modality = 'CT' | 'MRI' | 'X-ray' | 'Ultrasound' | 'Mammography' | 'C-arm';
export type ReadingStatus = 'unread' | 'reading' | 'completed';

export interface PacsStudy {
  patientId: string;
  patientName: string;
  examId: string;
  accessionNumber: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  bodyPart: string;
  modality: Modality;
  acquisitionEquipmentName?: string;
  imageCount: number;
  readingStatus: ReadingStatus;
}

export const PACS_STUDIES: PacsStudy[] = [
  { patientId: 'P202504-0182', patientName: '김영수', examId: 'EX-250424-041', accessionNumber: 'ACC-250424-0841', studyInstanceUid: '1.2.410.200001.20250424.841', seriesInstanceUid: '1.2.410.200001.20250424.841.1', sopInstanceUid: '1.2.410.200001.20250424.841.1.1', studyDate: '2026.09.08', studyTime: '14:32', studyDescription: 'Chest PA', bodyPart: '흉부', modality: 'X-ray', acquisitionEquipmentName: 'X-ray 1', imageCount: 2, readingStatus: 'unread' },
  { patientId: 'P202503-0964', patientName: '이정희', examId: 'EX-250424-038', accessionNumber: 'ACC-250424-0838', studyInstanceUid: '1.2.410.200001.20250424.838', seriesInstanceUid: '1.2.410.200001.20250424.838.1', sopInstanceUid: '1.2.410.200001.20250424.838.1.1', studyDate: '2026.09.08', studyTime: '13:48', studyDescription: 'Brain CT (CE)', bodyPart: '뇌', modality: 'CT', imageCount: 326, readingStatus: 'reading' },
  { patientId: 'P202501-2041', patientName: '박민준', examId: 'EX-250424-035', accessionNumber: 'ACC-250424-0835', studyInstanceUid: '1.2.410.200001.20250424.835', seriesInstanceUid: '1.2.410.200001.20250424.835.1', sopInstanceUid: '1.2.410.200001.20250424.835.1.1', studyDate: '2026.09.08', studyTime: '11:21', studyDescription: 'L-spine MRI', bodyPart: '요추', modality: 'MRI', imageCount: 184, readingStatus: 'completed' },
  { patientId: 'P202504-0217', patientName: '최수진', examId: 'EX-250424-029', accessionNumber: 'ACC-250424-0829', studyInstanceUid: '1.2.410.200001.20250424.829', seriesInstanceUid: '1.2.410.200001.20250424.829.1', sopInstanceUid: '1.2.410.200001.20250424.829.1.1', studyDate: '2026.09.08', studyTime: '10:05', studyDescription: 'Abdomen Sono', bodyPart: '복부', modality: 'Ultrasound', imageCount: 42, readingStatus: 'unread' },
  { patientId: 'P202402-1183', patientName: '정미경', examId: 'EX-250424-024', accessionNumber: 'ACC-250424-0824', studyInstanceUid: '1.2.410.200001.20250424.824', seriesInstanceUid: '1.2.410.200001.20250424.824.1', sopInstanceUid: '1.2.410.200001.20250424.824.1.1', studyDate: '2026.09.08', studyTime: '09:37', studyDescription: 'Mammography Both', bodyPart: '유방', modality: 'Mammography', imageCount: 4, readingStatus: 'completed' },
  { patientId: 'P202410-0762', patientName: '한도윤', examId: 'EX-250423-118', accessionNumber: 'ACC-250423-0918', studyInstanceUid: '1.2.410.200001.20250423.918', seriesInstanceUid: '1.2.410.200001.20250423.918.1', sopInstanceUid: '1.2.410.200001.20250423.918.1.1', studyDate: '2026.09.07', studyTime: '17:16', studyDescription: 'Knee AP/LAT', bodyPart: '우측 슬관절', modality: 'X-ray', acquisitionEquipmentName: 'X-ray 2', imageCount: 3, readingStatus: 'completed' },
  { patientId: 'P202503-0435', patientName: '오지훈', examId: 'EX-250423-105', accessionNumber: 'ACC-250423-0905', studyInstanceUid: '1.2.410.200001.20250423.905', seriesInstanceUid: '1.2.410.200001.20250423.905.1', sopInstanceUid: '1.2.410.200001.20250423.905.1.1', studyDate: '2026.09.07', studyTime: '15:42', studyDescription: 'CAG C-arm', bodyPart: '심장', modality: 'C-arm', imageCount: 892, readingStatus: 'reading' },
  { patientId: 'P202411-1688', patientName: '윤서연', examId: 'EX-250423-097', accessionNumber: 'ACC-250423-0897', studyInstanceUid: '1.2.410.200001.20250423.897', seriesInstanceUid: '1.2.410.200001.20250423.897.1', sopInstanceUid: '1.2.410.200001.20250423.897.1.1', studyDate: '2026.09.07', studyTime: '14:28', studyDescription: 'Chest Portable', bodyPart: '흉부', modality: 'X-ray', acquisitionEquipmentName: 'Portable X-ray', imageCount: 1, readingStatus: 'unread' },
  { patientId: 'P202306-0221', patientName: '장현우', examId: 'EX-250423-082', accessionNumber: 'ACC-250423-0882', studyInstanceUid: '1.2.410.200001.20250423.882', seriesInstanceUid: '1.2.410.200001.20250423.882.1', sopInstanceUid: '1.2.410.200001.20250423.882.1.1', studyDate: '2026.09.07', studyTime: '11:54', studyDescription: 'Low-dose Chest CT', bodyPart: '흉부', modality: 'CT', imageCount: 412, readingStatus: 'completed' },
  { patientId: 'P202504-0199', patientName: '임하은', examId: 'EX-250423-071', accessionNumber: 'ACC-250423-0871', studyInstanceUid: '1.2.410.200001.20250423.871', seriesInstanceUid: '1.2.410.200001.20250423.871.1', sopInstanceUid: '1.2.410.200001.20250423.871.1.1', studyDate: '2026.09.07', studyTime: '10:18', studyDescription: 'Shoulder MRI', bodyPart: '좌측 견관절', modality: 'MRI', imageCount: 216, readingStatus: 'completed' },
];
