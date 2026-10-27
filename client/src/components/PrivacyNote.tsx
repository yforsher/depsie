import { useRef } from 'react';

// A link-styled button that opens the privacy details in a native modal dialog, which handles
// focus, Esc and the backdrop itself.
export function PrivacyNote() {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className="link-button" onClick={() => dialog.current!.showModal()}>
        How your data is handled
      </button>
      <dialog ref={dialog} className="privacy" aria-labelledby="privacy-title">
        <h2 id="privacy-title">How your data is handled</h2>
        <ul>
          <li>
            Only what is listed under "What is sent" leaves your browser: your need, the framework,
            and the filtered dependency names and version ranges.
          </li>
          <li>
            Your package.json is read in your browser and is never sent. Private scopes and
            dependencies that are not from the npm registry are left out.
          </li>
          <li>
            The server passes what you send to an AI model through OpenRouter to build the report.
            The AI provider's own data policy applies there, so leave personal or confidential
            details out of the need.
          </li>
          <li>
            Nothing you send and no report is stored on our server. There are no accounts and no
            cookies.
          </li>
          <li>
            Package data comes from public sources: npm, deps.dev, OSV.dev, GitHub and jsDelivr.
          </li>
          <li>
            The code is open source, so you can check all of this on{' '}
            <a href="https://github.com/yforsher/dependency-decision">GitHub</a>.
          </li>
        </ul>
        <button type="button" onClick={() => dialog.current!.close()}>
          Close
        </button>
      </dialog>
    </>
  );
}
