import { useQuery } from '@tanstack/react-query';
import { fetchOwnedReport } from '../api';
import { OlderFormatNote } from './OlderFormatNote';
import { ReportView } from './ReportView';
import { ShareControls } from './ShareControls';

// A signed-in user's saved report, latest version, with its share link.
export function SavedReportPage({ id }: { id: string }) {
  const owned = useQuery({ queryKey: ['report', id], queryFn: () => fetchOwnedReport(id) });

  if (owned.isPending) return null;
  if (owned.error || !owned.data) {
    return (
      <main className="narrow">
        <p className="panel">
          {owned.error?.message ?? 'Report not found. It may have been deleted or expired.'}
        </p>
      </main>
    );
  }
  const { report, olderFormat, ...saved } = owned.data;
  return (
    <main>
      {olderFormat && <OlderFormatNote />}
      <ReportView report={report} />
      {!olderFormat && <ShareControls saved={saved} />}
    </main>
  );
}
