import type {
  FeaturesResponse,
  Me,
  OwnedReport,
  ReportRequest,
  ReportResponse,
  SavedReport,
  SharedReport,
} from 'shared';

async function serverError(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

// 400, 429 and 503 bodies say what to change or why; 502 details are for the server log, not the
// user.
async function errorMessage(res: Response): Promise<string> {
  switch (res.status) {
    case 400:
      return `The request was not accepted: ${await serverError(res)}`;
    case 429:
    case 503:
      return `${await serverError(res)} Please try again later.`;
    case 502:
      return 'The AI could not produce a valid report this time. Please try again.';
    default:
      return `The report could not be generated (status ${res.status}).`;
  }
}

export async function fetchReport(request: ReportRequest): Promise<ReportResponse> {
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json() as Promise<ReportResponse>;
}

export async function fetchFeatures(): Promise<FeaturesResponse> {
  const res = await fetch('/api/features');
  if (!res.ok) throw new Error(`Feature flags failed with status ${res.status}`);
  return res.json() as Promise<FeaturesResponse>;
}

// The signed-in user, or null when nobody is, or when accounts is not on for this visitor (404).
export async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/api/me');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Reading the signed-in user failed with status ${res.status}`);
  return res.json() as Promise<Me | null>;
}

// Creates the share link of a saved report (POST), or revokes it (DELETE, owners only). Any failure
// means the report is gone, expired or not the caller's: one message covers them all.
export async function changeShareLink(id: string, method: 'POST' | 'DELETE'): Promise<SavedReport> {
  const res = await fetch(`/api/reports/${id}/share`, { method });
  if (!res.ok) throw new Error('The link could not be changed. The report may have expired.');
  return res.json() as Promise<SavedReport>;
}

// A report by its share link, or null when the link does not exist or has expired (404).
export async function fetchSharedReport(shareId: string): Promise<SharedReport | null> {
  const res = await fetch(`/api/s/${shareId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The report could not be loaded (status ${res.status}).`);
  return res.json() as Promise<SharedReport>;
}

// Deletes an anonymous report by its share link.
export async function deleteSharedReport(shareId: string): Promise<void> {
  const res = await fetch(`/api/s/${shareId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('The report could not be deleted. It may already be gone.');
}

// The signed-in owner's report, or null when it is not found (404: missing, expired or not theirs).
export async function fetchOwnedReport(id: string): Promise<OwnedReport | null> {
  const res = await fetch(`/api/reports/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The report could not be loaded (status ${res.status}).`);
  return res.json() as Promise<OwnedReport>;
}
