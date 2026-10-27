import type { FilterResult, SkipReason } from '../packageJson';
import { PrivacyNote } from './PrivacyNote';

const reasonLabels: Record<SkipReason, string> = {
  'scope-not-allowed': 'scope not allowed',
  'non-registry': 'not from the npm registry',
};

interface Props {
  need: string;
  framework: string;
  result: FilterResult;
}

export function SentPreview({ need, framework, result }: Props) {
  return (
    <section className="preview" aria-labelledby="preview-title">
      <h2 id="preview-title">What is sent</h2>
      <dl>
        <dt>Need</dt>
        <dd>{need || <span className="hint">Not filled in yet</span>}</dd>
        <dt>Framework</dt>
        <dd>{framework || <span className="hint">Not selected yet</span>}</dd>
        <dt>Dependencies ({result.sent.length})</dt>
        <dd>
          {result.sent.length === 0 ? (
            <span className="hint">None</span>
          ) : (
            <ul className="deps">
              {result.sent.map((dep) => (
                <li key={dep.name}>
                  {dep.name} <span className="hint">{dep.range}</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      {result.skipped.length > 0 && (
        <>
          <h3>Not sent ({result.skipped.length})</h3>
          <ul className="deps">
            {result.skipped.map((dep) => (
              <li key={dep.name}>
                {dep.name} <span className="hint">{reasonLabels[dep.reason]}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="hint">
        Your package.json itself is never sent, only the names and version ranges listed above.
      </p>
      <PrivacyNote />
    </section>
  );
}
