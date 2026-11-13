import type { FeaturesResponse, Report, ReportRequest } from 'shared';

async function serverError(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

// 400 and 429 bodies say what to change; 502 details are for the server log, not the user.
async function errorMessage(res: Response): Promise<string> {
  switch (res.status) {
    case 400:
      return `The request was not accepted: ${await serverError(res)}`;
    case 429:
      return `${await serverError(res)} Please try again later.`;
    case 502:
      return 'The AI could not produce a valid report this time. Please try again.';
    default:
      return `The report could not be generated (status ${res.status}).`;
  }
}

export async function fetchReport(request: ReportRequest): Promise<Report> {
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json() as Promise<Report>;
}

export async function fetchFeatures(): Promise<FeaturesResponse> {
  const res = await fetch('/api/features');
  if (!res.ok) throw new Error(`Feature flags failed with status ${res.status}`);
  return res.json() as Promise<FeaturesResponse>;
}
