import { getOrthancStudies } from '../../../../lib/orthanc';

export async function GET() {
  try {
    return Response.json({ studies: await getOrthancStudies() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Orthanc connection failed';
    return Response.json({ studies: [], error: message }, { status: 503 });
  }
}
