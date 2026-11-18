import { useState } from 'react';

interface Props {
  label: string;
  onConfirm: () => void;
  pending: boolean;
}

// Deleting cannot be undone, so the first click only asks; the second one deletes.
export function DeleteButton({ label, onConfirm, pending }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className="danger-outline-button" onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="page-links">
      <button type="button" className="danger-button" disabled={pending} onClick={onConfirm}>
        Delete permanently
      </button>
      <button type="button" className="link-button" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  );
}
