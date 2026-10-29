import { useMutation } from '@tanstack/react-query';
import type { Report } from 'shared';
import { fetchReport } from './api';
import { RequestForm } from './components/RequestForm';
import { ReportView } from './components/ReportView';

export function App() {
  const report = useMutation({ mutationFn: fetchReport });

  return (
    <main>
      <header className="app-header">
        <h1>
          <img src="/logo.svg" alt="" />
          Depsie
        </h1>
        <p>Describe what you need and get a ranked, sourced comparison of npm packages.</p>
      </header>
      <div className="columns">
        <RequestForm onSubmit={report.mutate} isPending={report.isPending} />
        <section className="result" aria-label="Result">
          <Result isPending={report.isPending} error={report.error} data={report.data} />
        </section>
      </div>
    </main>
  );
}

interface ResultProps {
  isPending: boolean;
  error: Error | null;
  data: Report | undefined;
}

function Result({ isPending, error, data }: ResultProps) {
  if (isPending) {
    return (
      <div className="placeholder" role="status">
        <div className="progress" aria-hidden="true" />
        <p>Finding candidates, fetching their data and comparing them. This can take a minute.</p>
      </div>
    );
  }
  if (error) {
    return (
      <p className="placeholder errors" role="alert">
        {error.message}
      </p>
    );
  }
  if (data) return <ReportView report={data} />;
  return (
    <p className="placeholder">
      Your recommendation appears here. Describe what you need, pick a framework, and select Get
      recommendation.
    </p>
  );
}
