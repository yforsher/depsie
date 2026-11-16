import { useRef, useState } from 'react';
import { useSignIn } from '../features';

// A link-styled button that opens the privacy details in a native modal dialog, which handles
// focus, Esc and the backdrop itself.
export function PrivacyNote() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setOpen(true);
          dialog.current!.showModal();
        }}
      >
        How your data is handled
      </button>
      <dialog
        ref={dialog}
        className="privacy"
        aria-labelledby="privacy-title"
        onClose={() => setOpen(false)}
      >
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
          {open && <StorageLine />}
          <li>
            The tokens and cost of each AI call are stored with its day (not the time) to enforce
            daily cost limits, with your account when you are signed in.
          </li>
          <li>
            Anonymous usage counts are stored: page visits and reports with the time, country,
            framework, and success or error status. Unique visitors are counted per day with a hash
            of the IP and a salt that changes daily and is never stored, so visitors cannot be
            identified or followed across days. The IP address, the need, the dependencies and the
            report are never recorded.
          </li>
          <li>
            Package data comes from public sources: npm, deps.dev, OSV.dev, GitHub and jsDelivr.
          </li>
          <li>
            The code is open source, so you can check all of this on{' '}
            <a href="https://github.com/yforsher/depsie" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            .
          </li>
        </ul>
        <button type="button" onClick={() => dialog.current!.close()}>
          Close
        </button>
      </dialog>
    </>
  );
}

// Asks for the flags only while the note is open, so loading the form makes no extra request.
function StorageLine() {
  return useSignIn() ? (
    <li>
      Nothing you send and no report is stored on our server. Signing in with GitHub stores your
      GitHub name, login, avatar and email, and sets a session cookie (plus a short-lived one while
      sign-in is under way); the GitHub access token and your IP address are not kept. Deleting your
      account deletes all of it. Without an account there are no cookies.
    </li>
  ) : (
    <li>
      Nothing you send and no report is stored on our server. There are no accounts and no cookies.
    </li>
  );
}
