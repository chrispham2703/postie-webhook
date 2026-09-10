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

function EventList() {
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
    return <p>Loading events...</p>;
  }

  if (error) {
    return <p>Couldn't load events — try again</p>;
  }

  return (
    <table>
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
  );
}

export default EventList;
