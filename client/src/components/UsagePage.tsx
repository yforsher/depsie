import { useQuery } from '@tanstack/react-query';
import { fetchUsage } from '../api';
import { formatDate } from '../reportFormat';

// The signed-in user's reports per UTC day, newest first, and today's reports against the cap.
// No cost: the user does not pay for the AI calls.
export function UsagePage() {
  const usage = useQuery({ queryKey: ['usage'], queryFn: fetchUsage });

  if (usage.isPending) return null;
  return (
    <main className="narrow">
      <section className="panel stack" aria-labelledby="usage-title">
        <h2 id="usage-title">Your usage</h2>
        {usage.error && <p className="errors">{usage.error.message}</p>}
        {usage.data && (
          <>
            <p>
              Today: {usage.data.todayReports} of {usage.data.dailyCap} reports
            </p>
            <p className="hint">The daily limit resets at midnight UTC. Last 30 days below.</p>
            {usage.data.days.length === 0 ? (
              <p className="hint">You have no usage yet.</p>
            ) : (
              <table className="usage-table">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Reports</th>
                    <th scope="col">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.data.days.map((day) => (
                    <tr key={day.day}>
                      <td>{formatDate(day.day)}</td>
                      <td>{day.reports}</td>
                      <td>{day.tokens.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </main>
  );
}
