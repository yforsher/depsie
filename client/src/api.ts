import type { Report, ReportRequest } from 'shared';
import { mockReport } from './mockReport';

// Returns a fixed report until Part 8 replaces this with POST /api/report.
export async function fetchReport(request: ReportRequest): Promise<Report> {
  return { ...mockReport, need: request.need, framework: request.framework };
}
