import { useEffect, useState } from 'react';
import api from './api';
import { StatusBadge } from './EventList';

function EventDetail({ eventId, onBack, onLogout }) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvent() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/dashboard/events/${eventId}`);
        if (!cancelled) {
          setEvent(res.data.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEvent();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Event detail</h1>
        <div>
          <button className="btn-secondary" onClick={onBack}>
            Back
          </button>
          <button className="btn-secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      {loading && <p className="dashboard-status">Loading event...</p>}
      {error && <p className="dashboard-status">Couldn't load event — try again</p>}

      {event && (
        <>
          <div className="detail-section">
            <h2>{event.eventType}</h2>
            <p>Created {new Date(event.createdAt).toLocaleString()}</p>
          </div>

          <div className="detail-section">
            <h2>Payload</h2>
            <pre className="payload-block">{JSON.stringify(event.payload, null, 2)}</pre>
          </div>

          {(event.deliveries ?? []).map((delivery) => (
            <div className="detail-section" key={delivery.id}>
              <h2>
                Delivery to {delivery.endpoint?.url ?? '—'} <StatusBadge status={delivery.status} />
              </h2>
              <ul className="attempt-timeline">
                {(delivery.attempts ?? []).map((attempt) => (
                  <li key={attempt.id}>
                    <span>#{attempt.attemptNum}</span>
                    <span>{attempt.statusCode}</span>
                    <span>{attempt.durationMs}ms</span>
                    <span>{new Date(attempt.createdAt).toLocaleString()}</span>
                  </li>
                ))}
                {(delivery.attempts ?? []).length === 0 && <li>No attempts yet</li>}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default EventDetail;
