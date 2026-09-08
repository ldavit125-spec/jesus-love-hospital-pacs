import { getSeriesInstances, hierarchyFailure, resourceId } from '../../../../lib/orthanc-hierarchy';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json({ instances: await getSeriesInstances(resourceId(params.get('studyId')), resourceId(params.get('seriesId'))) });
  } catch (error) { return hierarchyFailure(error); }
}
