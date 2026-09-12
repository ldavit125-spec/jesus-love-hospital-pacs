import { fetchOrthanc } from '../../../../lib/orthanc';
import { resourceId, HierarchyError, hierarchyFailure } from '../../../../lib/orthanc-hierarchy';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const instanceId = resourceId(searchParams.get('instanceId'));

    const orthancRes = await fetchOrthanc(`/instances/${instanceId}/file`, {
      cache: 'no-store',
    });

    if (!orthancRes.ok) {
      throw new HierarchyError(`Orthanc instance file fetch failed: HTTP ${orthancRes.status}`, orthancRes.status === 404 ? 404 : 502);
    }

    const fileBuffer = await orthancRes.arrayBuffer();

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/dicom',
        'Content-Length': fileBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return hierarchyFailure(error);
  }
}
