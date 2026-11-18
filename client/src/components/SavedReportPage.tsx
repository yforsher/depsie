import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { dataAge, type OwnedReport, type ReportVersion } from 'shared';
import { deleteReport, fetchOwnedReport, refreshReport } from '../api';
import { formatDate } from '../reportFormat';
import { DeleteButton } from './DeleteButton';
import { OlderFormatNote } from './OlderFormatNote';
import { ReportView } from './ReportView';
import { ShareControls } from './ShareControls';

const sourceLabels: Record<ReportVersion['source'], string> = {
  pipeline: 'new report',
  refresh: 'refresh',
  chat: 'chat',
  agent: 'agent',
};

// A signed-in user's saved report: the latest version, or an earlier one read-only, with its
// version list, share link, refresh and delete.
export function SavedReportPage({ id, version }: { id: string; version?: number }) {
  const owned = useQuery({
    queryKey: ['report', id, version],
    queryFn: () => fetchOwnedReport(id, version),
  });

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
  return <OwnedReportView owned={owned.data} />;
}

function OwnedReportView({ owned }: { owned: OwnedReport }) {
  const { report, olderFormat, version, versions, ...saved } = owned;
  const latest = versions.at(-1)!.version;
  const isLatest = version === latest;
  // The latest version can be refreshed at any age: from the old-data warning once it shows, else
  // from the history panel, so there is only ever one Refresh button.
  const stale = dataAge(report.generatedAt, new Date()).stale;

  return (
    <main>
      {olderFormat && <OlderFormatNote />}
      {!isLatest && (
        <p className="panel hint" role="note">
          You are viewing version {version}, an earlier version of this report.
        </p>
      )}
      <ReportView
        report={report}
        staleAction={
          isLatest ? (
            <RefreshButton id={saved.id} />
          ) : (
            <Link to="/reports/$id" params={{ id: saved.id }}>
              Open the latest version
            </Link>
          )
        }
      />
      {isLatest && !olderFormat && <ShareControls key={`${saved.id}-${version}`} saved={saved} />}
      <section className="panel stack" aria-label="Report history">
        <VersionList id={saved.id} shown={version} versions={versions} latest={latest} />
        {isLatest && !stale && <RefreshButton id={saved.id} />}
        <DeleteReport id={saved.id} />
      </section>
    </main>
  );
}

function VersionList(props: {
  id: string;
  shown: number;
  versions: ReportVersion[];
  latest: number;
}) {
  return (
    <nav aria-label="Versions">
      <h3>Versions</h3>
      <ol className="version-list">
        {props.versions.map((v) => (
          <li key={v.version}>
            <Link
              to="/reports/$id"
              params={{ id: props.id }}
              search={v.version === props.latest ? {} : { version: v.version }}
              aria-current={v.version === props.shown ? 'page' : undefined}
            >
              Version {v.version}, {sourceLabels[v.source]}, {formatDate(v.createdAt)}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Runs the report again with its saved inputs; the answer is the new latest version.
function RefreshButton({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refresh = useMutation({
    mutationFn: () => refreshReport(id),
    onSuccess: async (next) => {
      queryClient.setQueryData(['report', id, undefined], next);
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      await navigate({ to: '/reports/$id', params: { id }, search: {} });
    },
  });

  return (
    <>
      <button type="button" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
        {refresh.isPending ? 'Refreshing...' : 'Refresh'}
      </button>
      {refresh.error && (
        <p className="errors" role="alert">
          {refresh.error.message}
        </p>
      )}
    </>
  );
}

// Deletes the whole report, then returns to the list, replacing this page in the history so Back
// does not reopen a report that no longer exists.
function DeleteReport({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: () => deleteReport(id),
    onSuccess: async () => {
      await navigate({ to: '/reports', replace: true });
      queryClient.removeQueries({ queryKey: ['report', id] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  return (
    <>
      <DeleteButton
        label="Delete report"
        onConfirm={() => remove.mutate()}
        pending={remove.isPending}
      />
      {remove.error && (
        <p className="errors" role="alert">
          {remove.error.message}
        </p>
      )}
    </>
  );
}
