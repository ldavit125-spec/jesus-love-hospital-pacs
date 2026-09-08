import { getStudySeries, hierarchyFailure, resourceId } from '../../../../lib/orthanc-hierarchy';

export async function GET(request: Request) {
  try {
    const studyId = resourceId(new URL(request.url).searchParams.get('studyId'));
    return Response.json({ series: await getStudySeries(studyId) });
  } catch (error) { return hierarchyFailure(error); }
}
