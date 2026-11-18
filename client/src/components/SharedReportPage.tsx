import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMe } from '../account';
import { deleteSharedReport, fetchSharedReport } from '../api';
import { useSignIn } from '../features';
import { formatDate } from '../reportFormat';
import { OlderFormatNote } from './OlderFormatNote';
import { ReportView } from './ReportView';

// A report opened by its share link: read-only, for anyone. An anonymous report can be deleted
// here, after a confirmation.
export function SharedReportPage({ shareId }: { shareId: string }) {
  const shared = useQuery({
    queryKey: ['shared', shareId],
    queryFn: () => fetchSharedReport(shareId),
  });
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({ mutationFn: () => deleteSharedReport(shareId) });

  if (remove.isSuccess) return <Message text="This report was deleted." />;
  if (shared.isPending) return null;
  if (shared.error) return <Message text={shared.error.message} />;
  if (!shared.data) return <Message text="This link does not exist or has expired." />;
  const { report, expiresAt, deletable, olderFormat } = shared.data;

  return (
    <main>
      {olderFormat && <OlderFormatNote />}
      <ReportView report={report} staleAction={<NewReportLinks />} />
      <section className="panel stack share" aria-label="Shared report">
        <p className="hint">
          A shared report, read-only. It is deleted on {formatDate(expiresAt)}.
        </p>
        {deletable &&
          (confirming ? (
            <div className="page-links">
              <button type="button" className="danger-button" onClick={() => remove.mutate()}>
                Delete permanently
              </button>
              <button type="button" className="link-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="danger-outline-button"
              onClick={() => setConfirming(true)}
            >
              Delete report
            </button>
          ))}
        {remove.error && (
          <p className="errors" role="alert">
            {remove.error.message}
          </p>
        )}
      </section>
    </main>
  );
}

// A shared report cannot be refreshed: the viewer can sign in to keep their own reports up to
// date, or run a new one.
function NewReportLinks() {
  const signIn = useSignIn();
  const me = useMe();
  return (
    <span className="page-links">
      {signIn && !me.data && <Link to="/signin">Sign in</Link>}
      <Link to="/">Run a new report</Link>
    </span>
  );
}

function Message({ text }: { text: string }) {
  return (
    <main className="narrow">
      <p className="panel">{text}</p>
    </main>
  );
}
