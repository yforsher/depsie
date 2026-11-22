import { useQuery } from '@tanstack/react-query';
import { fetchUsage } from '../api';
import { formatDate } from '../reportFormat';

// A report costs about $0.002, so cents alone would show most days as $0.00.
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

// The signed-in user's AI usage per UTC day, newest first, and today's spend against the cap.
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
              Today: {usd.format(usage.data.todayCost)} of {usd.format(usage.data.dailyCap)}
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
                    <th scope="col">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.data.days.map((day) => (
                    <tr key={day.day}>
                      <td>{formatDate(day.day)}</td>
                      <td>{day.reports}</td>
                      <td>{day.tokens.toLocaleString('en-US')}</td>
                      <td>{usd.format(day.cost)}</td>
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
