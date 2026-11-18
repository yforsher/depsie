import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { SavedReport } from 'shared';
import { changeShareLink } from '../api';
import { formatDate } from '../reportFormat';

// Under a saved report: create its share link, copy it, and for a signed-in owner revoke it and
// open the saved report. Starts from what the server returned and follows each change it answers.
// openLink: under a fresh result, also link to the saved report's own page.
export function ShareControls({
  saved: initial,
  openLink = false,
}: {
  saved: SavedReport;
  openLink?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [copied, setCopied] = useState(false);
  const change = useMutation({
    mutationFn: (method: 'POST' | 'DELETE') => changeShareLink(saved.id, method),
    onSuccess: (next) => {
      setSaved(next);
      setCopied(false);
    },
  });
  const url = saved.shareId && `${location.origin}/s/${saved.shareId}`;

  async function copy() {
    await navigator.clipboard.writeText(url!);
    setCopied(true);
  }

  return (
    <section className="panel stack share" aria-label="Share">
      {url ? (
        <>
          <div className="share-link">
            <input
              aria-label="Share link"
              value={url}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button type="button" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="hint">
            {saved.owned
              ? 'Anyone with the link can open this report, read-only, until you revoke it.'
              : 'Anyone with the link can open this report, read-only, and delete it.'}{' '}
            The report is deleted on {formatDate(saved.expiresAt)}.
          </p>
        </>
      ) : (
        <>
          <button type="button" onClick={() => change.mutate('POST')} disabled={change.isPending}>
            Create share link
          </button>
          <p className="hint">
            {saved.owned
              ? `Private: only you can open this report until you create a share link. It is deleted on ${formatDate(saved.expiresAt)}, 100 days after its latest version.`
              : `Not shared: it is shown only on this page until you create a share link. It is deleted on ${formatDate(saved.expiresAt)}, or 30 days after its creation once it has a link.`}
          </p>
        </>
      )}
      {saved.owned && (
        <div className="page-links">
          {openLink && <a href={`/reports/${saved.id}`}>Open saved report</a>}
          {url && (
            <button
              type="button"
              className="link-button"
              onClick={() => change.mutate('DELETE')}
              disabled={change.isPending}
            >
              Revoke link
            </button>
          )}
        </div>
      )}
      {change.error && (
        <p className="errors" role="alert">
          {change.error.message}
        </p>
      )}
    </section>
  );
}
