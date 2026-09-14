import { useEffect, useState } from 'react';
import api from './api';

const STATUS_COLORS = {
  delivered: '#2e7d32', // green
  pending: '#f9a825', // yellow
  failed: '#c62828', // red
  dead_letter: '#757575', // grey
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span
      style={{
        backgroundColor: color,
        color: 'white',
        borderRadius: '4px',
        padding: '2px 8px',
        fontSize: '0.85em',
      }}
    >
      {status || 'unknown'}
    </span>
  );
}

function EventList({ onLogout }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/api/dashboard/events');
        if (!cancelled) {
          setEvents(res.data.data);
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

    fetchEvents();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-header">
          <h1>Events</h1>
          <button className="btn-secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
        <p className="dashboard-status">Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-header">
          <h1>Events</h1>
          <button className="btn-secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
        <p className="dashboard-status">Couldn't load events — try again</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Events</h1>
        <button className="btn-secondary" onClick={onLogout}>
          Log out
        </button>
      </div>
      <div className="event-table-wrap">
        <table className="event-table">
          <thead>
            <tr>
              <th>Event type</th>
              <th>Target URL</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const delivery = event.deliveries?.[0];
              return (
                <tr key={event.id}>
                  <td>{event.eventType}</td>
                  <td>{delivery?.endpoint?.url ?? '—'}</td>
                  <td>
                    <StatusBadge status={delivery?.status} />
                  </td>
                  <td>{new Date(event.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EventList;
