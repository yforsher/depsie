import { useMutation } from '@tanstack/react-query';
import { fetchReport } from './api';
import { RequestForm } from './components/RequestForm';
import { ReportView } from './components/ReportView';

export function App() {
  const report = useMutation({ mutationFn: fetchReport });

  return (
    <main>
      <header>
        <h1>dependency-decision</h1>
        <p>Describe what you need and get a ranked, sourced comparison of npm packages.</p>
      </header>
      <RequestForm onSubmit={report.mutate} isPending={report.isPending} />
      {report.isPending && (
        <p className="hint" role="status">
          Finding candidates, fetching their data and comparing them. This can take a minute.
        </p>
      )}
      {report.isError && (
        <p className="errors" role="alert">
          {report.error.message}
        </p>
      )}
      {report.data && <ReportView report={report.data} />}
    </main>
  );
}
