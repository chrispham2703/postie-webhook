import { useEffect, useState } from 'react';
import api from './api';

// Matches the real Delivery.status values set in src/workers/deliveryWorker.js
// -- there is no separate 'dead_letter' status; the DLQ is just the
// failed_permanent filter on this same table.
const STATUS_COLORS = {
  delivered: '#2e7d32', // green
  pending: '#f9a825', // yellow
  failed_permanent: '#c62828', // red
  cancelled: '#757575', // grey -- endpoint was disabled, never sent
};

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed_permanent', label: 'Dead letter (failed permanently)' },
  { value: 'cancelled', label: 'Cancelled (endpoint disabled)' },
];

// Order the per-status counts in the list view, best outcome first.
const STATUS_ORDER = ['delivered', 'pending', 'failed_permanent', 'cancelled'];
const SHORT_LABELS = { failed_permanent: 'failed' };

// Count deliveries per status, e.g. [{ status: 'delivered', count: 1 }, { status: 'failed_permanent', count: 5 }].
function summarizeDeliveries(deliveries) {
  const counts = new Map();
  for (const { status } of deliveries) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const rank = (status) => (STATUS_ORDER.includes(status) ? STATUS_ORDER.indexOf(status) : STATUS_ORDER.length);
  return [...counts.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([status, count]) => ({ status, count }));
}

export function StatusBadge({ status, label }) {
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
      {label ?? (status || 'unknown')}
    </span>
  );
}

function EventListHeader({ statusFilter, onStatusFilterChange, onSendTestEvent, sending, onLogout, onOpenSetup }) {
  return (
    <div className="dashboard-header">
      <h1>Events</h1>
      <div>
        <select className="status-filter" value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={onSendTestEvent} disabled={sending}>
          {sending ? 'Sending...' : 'Send test event'}
        </button>
        <button className="btn-secondary" onClick={onOpenSetup}>
          Setup
        </button>
        <button className="btn-secondary" onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}

function EventList({ onLogout, onSelectEvent, onOpenSetup }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  // Cursor pagination is forward-only on the backend (it only ever hands back
  // a nextCursor). To support "Previous" on the client, cursorStack holds the
  // cursor used for every page we've already visited, so going back just pops
  // the last one instead of asking the server for something it can't give.
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [pageMeta, setPageMeta] = useState({ nextCursor: null, hasMore: false });
  const [sending, setSending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleSendTestEvent() {
    setSending(true);
    try {
      await api.post('/api/dashboard/events/test');
      // Jump back to page 1 of the unfiltered list, so the brand-new event
      // (which sorts first, newest-created-first) is guaranteed to be visible
      // immediately instead of possibly landing on a page/filter you're not on.
      setStatusFilter('');
      setCursor(null);
      setCursorStack([]);
      setRefreshKey((k) => k + 1);
    } catch {
      alert('Could not send a test event — open Setup to create an application and an endpoint first.');
    } finally {
      setSending(false);
    }
  }

  function handleStatusFilterChange(value) {
    setStatusFilter(value);
    setCursor(null);
    setCursorStack([]);
  }

  function goNext() {
    if (!pageMeta.hasMore) return;
    setCursorStack((prev) => [...prev, cursor]);
    setCursor(pageMeta.nextCursor);
  }

  function goPrevious() {
    if (cursorStack.length === 0) return;
    const previousCursor = cursorStack[cursorStack.length - 1];
    setCursorStack((prev) => prev.slice(0, -1));
    setCursor(previousCursor);
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/api/dashboard/events', {
          params: {
            ...(statusFilter && { status: statusFilter }),
            ...(cursor && { cursor }),
          },
        });
        if (!cancelled) {
          setEvents(res.data.data);
          setPageMeta(res.data.meta);
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
  }, [statusFilter, cursor, refreshKey]);

  if (loading) {
    return (
      <div className="dashboard-page">
        <EventListHeader statusFilter={statusFilter} onStatusFilterChange={handleStatusFilterChange} onSendTestEvent={handleSendTestEvent} sending={sending} onLogout={onLogout} onOpenSetup={onOpenSetup} />
        <p className="dashboard-status">Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <EventListHeader statusFilter={statusFilter} onStatusFilterChange={handleStatusFilterChange} onSendTestEvent={handleSendTestEvent} sending={sending} onLogout={onLogout} onOpenSetup={onOpenSetup} />
        <p className="dashboard-status">Couldn't load events — try again</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <EventListHeader statusFilter={statusFilter} onStatusFilterChange={handleStatusFilterChange} onSendTestEvent={handleSendTestEvent} sending={sending} onLogout={onLogout} onOpenSetup={onOpenSetup} />
      <div className="event-table-wrap">
        <table className="event-table">
          <thead>
            <tr>
              <th>Event type</th>
              <th>Deliveries</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              // One event fans out to every matching endpoint. The row shows a
              // count per status; the detail page lists each endpoint.
              const deliveries = event.deliveries ?? [];
              const endpointUrls = deliveries.map((d) => d.endpoint?.url ?? '—').join('\n');
              return (
                <tr key={event.id} className="event-row" onClick={() => onSelectEvent(event.id)}>
                  <td>{event.eventType}</td>
                  <td>
                    {deliveries.length === 0 ? (
                      '—'
                    ) : (
                      <div className="delivery-summary" title={endpointUrls}>
                        {summarizeDeliveries(deliveries).map(({ status, count }) => (
                          <StatusBadge
                            key={status}
                            status={status}
                            label={`${count} ${SHORT_LABELS[status] ?? status}`}
                          />
                        ))}
                        <span className="delivery-count">
                          {deliveries.length} {deliveries.length === 1 ? 'endpoint' : 'endpoints'}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>{new Date(event.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={3} className="dashboard-status">
                  No events match this filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination-controls">
        <button className="btn-secondary" onClick={goPrevious} disabled={cursorStack.length === 0}>
          Previous
        </button>
        <button className="btn-secondary" onClick={goNext} disabled={!pageMeta.hasMore}>
          Next
        </button>
      </div>
    </div>
  );
}

export default EventList;
