import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReportSummary } from 'shared';
import { deleteReport, fetchReports } from '../api';
import { formatDate } from '../reportFormat';
import { DeleteButton } from './DeleteButton';

// The signed-in user's saved reports, most recently updated first.
export function ReportsPage() {
  const reports = useQuery({ queryKey: ['reports'], queryFn: fetchReports });

  if (reports.isPending) return null;
  return (
    <main className="narrow">
      <section className="panel stack" aria-labelledby="reports-title">
        <h2 id="reports-title">Your reports</h2>
        {reports.error && <p className="errors">{reports.error.message}</p>}
        {reports.data?.length === 0 && (
          <p className="hint">You have no saved reports yet. Reports you get are saved here.</p>
        )}
        {!!reports.data?.length && (
          <ul className="report-list">
            {reports.data.map((summary) => (
              <ReportRow key={summary.id} summary={summary} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ReportRow({ summary }: { summary: ReportSummary }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteReport(summary.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
  });
  const versions = summary.versionCount === 1 ? '1 version' : `${summary.versionCount} versions`;

  return (
    <li className="report-row">
      <div>
        <Link to="/reports/$id" params={{ id: summary.id }}>
          {summary.need}
        </Link>
        <p className="hint">
          {summary.framework} · Updated {formatDate(summary.updatedAt)} · {versions}
          {summary.shared && ' · Shared'}
        </p>
      </div>
      <DeleteButton label="Delete" onConfirm={() => remove.mutate()} pending={remove.isPending} />
      {remove.error && (
        <p className="errors" role="alert">
          {remove.error.message}
        </p>
      )}
    </li>
  );
}
