import { useState, type FormEvent } from 'react';
import { frameworks, type Framework, type ReportRequest } from 'shared';
import { filterDependencies, parsePackageJson, parseScopes } from '../packageJson';
import { SentPreview } from './SentPreview';

export const maxNeedLength = 500;
export const maxDependencies = 200;

interface Props {
  onSubmit: (request: ReportRequest) => void;
  isPending: boolean;
}

export function RequestForm({ onSubmit, isPending }: Props) {
  const [need, setNeed] = useState('');
  const [framework, setFramework] = useState<Framework | ''>('');
  const [packageJson, setPackageJson] = useState('');
  const [extraScopes, setExtraScopes] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const parsed = readPackageJson(packageJson);
  const filtered = filterDependencies(parsed.dependencies, parseScopes(extraScopes));
  const isFilled = need.trim() !== '' && framework !== '';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate(need, parsed.error, filtered.sent.length);
    setErrors(found);
    if (found.length > 0 || framework === '') return;

    const request: ReportRequest = { need: need.trim(), framework };
    if (filtered.sent.length > 0) request.dependencies = filtered.sent;
    onSubmit(request);
  }

  async function handleUpload(file: File | undefined) {
    if (file) setPackageJson(await file.text());
  }

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <label htmlFor="need">What do you need?</label>
      <textarea
        id="need"
        rows={3}
        value={need}
        onChange={(e) => setNeed(e.target.value)}
        placeholder="A date picker with range selection and keyboard support"
      />
      <p className="hint">
        {need.length}/{maxNeedLength} characters
      </p>

      <label htmlFor="framework">Framework</label>
      <select
        id="framework"
        value={framework}
        onChange={(e) => setFramework(e.target.value as Framework | '')}
      >
        <option value="">Select a framework</option>
        {frameworks.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>

      <details>
        <summary>Add your package.json (optional)</summary>
        {/* Content after <summary> ignores the details grid in Chrome, so it needs its own. */}
        <div className="field-group">
          <p className="hint">Parsed in your browser. The file itself is never sent.</p>
          <label htmlFor="package-json">Paste package.json</label>
          <textarea
            id="package-json"
            rows={6}
            value={packageJson}
            onChange={(e) => setPackageJson(e.target.value)}
          />
          <label htmlFor="package-json-file">Or upload it</label>
          <input
            id="package-json-file"
            type="file"
            accept=".json,application/json"
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
          <label htmlFor="extra-scopes">Extra allowed scopes</label>
          <input
            id="extra-scopes"
            value={extraScopes}
            onChange={(e) => setExtraScopes(e.target.value)}
            placeholder="@my-org, @another-scope"
          />
          <p className="hint">Scoped packages are only sent if their scope is allowed.</p>
        </div>
      </details>

      <SentPreview need={need.trim()} framework={framework} result={filtered} />

      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <button type="submit" disabled={!isFilled || isPending}>
        {isPending ? 'Generating report...' : 'Get recommendation'}
      </button>
    </form>
  );
}

function readPackageJson(text: string) {
  if (text.trim() === '') return { dependencies: [], error: false };
  try {
    return { dependencies: parsePackageJson(text), error: false };
  } catch {
    return { dependencies: [], error: true };
  }
}

function validate(need: string, jsonError: boolean, depCount: number) {
  const errors: string[] = [];
  if (need.length > maxNeedLength) errors.push(`Keep the need under ${maxNeedLength} characters.`);
  if (jsonError) errors.push('The package.json is not valid JSON.');
  if (depCount > maxDependencies) {
    errors.push(`At most ${maxDependencies} dependencies can be sent; ${depCount} found.`);
  }
  return errors;
}
