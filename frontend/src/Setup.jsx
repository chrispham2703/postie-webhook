import { useEffect, useState } from 'react';
import api from './api';
import ShowOnce from './ShowOnce';
import { canWrite } from './auth';

const NO_PERMISSION = "You don't have permission to do this. Ask an owner or admin.";

// Turns an API error into something to show next to the form: per-field
// messages for a 422, the permission message for a 403, a generic line otherwise.
function readError(err) {
  const status = err.response?.status;
  if (status === 403) return { forbidden: true, message: NO_PERMISSION };
  if (status === 422 && Array.isArray(err.response.data?.details)) {
    return { message: err.response.data.details.map((d) => d.msg).join('. ') };
  }
  return { message: 'Something went wrong — try again.' };
}

// Loads one list and keeps its own loading/error state, so one failing
// section doesn't blank the whole page.
function useList(path) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await api.get(path);
        if (!cancelled) setItems(res.data.data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [path, refreshKey]);

  return { items, loading, error, reload: () => setRefreshKey((k) => k + 1) };
}

function Checklist({ apps, endpoints, keys }) {
  const steps = [
    { label: 'Create an application', done: apps.items.length > 0 },
    { label: 'Add an endpoint to receive webhooks', done: endpoints.items.length > 0 },
    { label: 'Create an API key for your server', done: keys.items.length > 0 },
  ];
  const allDone = steps.every((s) => s.done);

  if (allDone) {
    return <p className="setup-complete">Setup complete. You can manage everything below.</p>;
  }
  return (
    <ol className="setup-checklist">
      {steps.map((s) => (
        <li key={s.label} className={s.done ? 'is-done' : ''}>
          <span aria-hidden="true">{s.done ? '✓' : '○'}</span> {s.label}
        </li>
      ))}
    </ol>
  );
}

function SectionState({ list, what }) {
  if (list.loading) return <p className="dashboard-status">Loading {what}...</p>;
  if (list.error) return <p className="dashboard-status">Couldn't load {what} — try again</p>;
  return null;
}

function ApplicationsSection({ apps, writable, onForbidden }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/dashboard/applications', { name });
      setName('');
      apps.reload();
    } catch (err) {
      const e2 = readError(err);
      if (e2.forbidden) onForbidden();
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="setup-section">
      <h2>1. Application</h2>
      <p className="setup-hint">An application groups your endpoints and events, for example one per product.</p>
      <SectionState list={apps} what="applications" />
      {!apps.loading && !apps.error && apps.items.length > 0 && (
        <ul className="setup-list">
          {apps.items.map((a) => (
            <li key={a.id}>{a.name}</li>
          ))}
        </ul>
      )}
      {writable && (
        <form className="setup-form" onSubmit={handleSubmit}>
          <label htmlFor="app-name">Application name</label>
          <div className="setup-row">
            <input id="app-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My shop" required />
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create application'}
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </section>
  );
}

function EndpointsSection({ apps, endpoints, writable, onForbidden }) {
  const onlyApp = apps.items.length === 1 ? apps.items[0].id : '';
  const [appId, setAppId] = useState('');
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [secret, setSecret] = useState(null);

  const chosenApp = appId || onlyApp;
  const appName = (id) => apps.items.find((a) => a.id === id)?.name ?? id;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const filterTypes = filter
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.post('/api/dashboard/endpoints', {
        appId: chosenApp,
        url,
        ...(filterTypes.length > 0 && { filterTypes }),
      });
      setUrl('');
      setFilter('');
      setSecret(res.data.data.secret);
    } catch (err) {
      const e2 = readError(err);
      if (e2.forbidden) onForbidden();
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDone() {
    // Clear the secret first, then refresh: nothing that could trigger a 401
    // reload runs while the secret is still on screen.
    setSecret(null);
    endpoints.reload();
  }

  return (
    <section className="setup-section">
      <h2>2. Endpoint</h2>
      <p className="setup-hint">The URL on your server where Postie delivers webhooks.</p>
      {apps.items.length === 0 && !apps.loading ? (
        <p className="setup-blocked">Create an application first.</p>
      ) : (
        <>
          <SectionState list={endpoints} what="endpoints" />
          {!endpoints.loading && !endpoints.error && endpoints.items.length > 0 && (
            <ul className="setup-list">
              {endpoints.items.map((ep) => (
                <li key={ep.id}>
                  <code>{ep.url}</code> <span className="setup-meta">· {appName(ep.appId)}</span>
                  {ep.disabled && <span className="setup-meta"> · disabled</span>}
                </li>
              ))}
            </ul>
          )}
          {secret && <ShowOnce label="signing secret" value={secret} onDone={handleDone} />}
          {writable && !secret && (
            <form className="setup-form" onSubmit={handleSubmit}>
              {apps.items.length > 1 && (
                <>
                  <label htmlFor="ep-app">Application</label>
                  <select id="ep-app" className="status-filter" value={appId} onChange={(e) => setAppId(e.target.value)} required>
                    <option value="">Choose an application</option>
                    {apps.items.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label htmlFor="ep-url">Endpoint URL</label>
              <input id="ep-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks" required />
              <label htmlFor="ep-filter">Only these event types (optional, comma separated)</label>
              <input id="ep-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="order.created, order.paid" />
              <div>
                <button className="btn-primary" type="submit" disabled={saving || !chosenApp}>
                  {saving ? 'Adding...' : 'Add endpoint'}
                </button>
              </div>
              {error && <p className="form-error">{error}</p>}
            </form>
          )}
        </>
      )}
    </section>
  );
}

function ApiKeysSection({ keys, writable, onForbidden }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [newKey, setNewKey] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/api/api-keys', { name });
      setName('');
      setNewKey(res.data.data.key);
    } catch (err) {
      const e2 = readError(err);
      if (e2.forbidden) onForbidden();
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDone() {
    setNewKey(null);
    keys.reload();
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://your-postie-url';

  return (
    <section className="setup-section">
      <h2>3. API key</h2>
      <p className="setup-hint">Your own server uses this key to send events to Postie. You can skip this to try a test event first.</p>
      <SectionState list={keys} what="API keys" />
      {!keys.loading && !keys.error && keys.items.length > 0 && (
        <ul className="setup-list">
          {keys.items.map((k) => (
            <li key={k.id}>
              {k.name} <code>{k.prefix}…</code>
              <span className="setup-meta"> · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : 'never used'}</span>
            </li>
          ))}
        </ul>
      )}
      {newKey && (
        <>
          <ShowOnce label="API key" value={newKey} onDone={handleDone} />
          <p className="setup-hint">Send an event from your server:</p>
          <pre className="setup-code">{`curl -X POST ${apiBase}/api/events \\
  -H "Authorization: Bearer ${newKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"appId": "<your application id>", "eventType": "order.created", "payload": {"orderId": 42}}'`}</pre>
        </>
      )}
      {writable && !newKey && (
        <form className="setup-form" onSubmit={handleSubmit}>
          <label htmlFor="key-name">Key name</label>
          <div className="setup-row">
            <input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production server" required />
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create API key'}
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </section>
  );
}

function TryItSection({ endpoints, onOpenEvents }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const ready = endpoints.items.length > 0;

  async function handleSend() {
    setSending(true);
    setResult(null);
    try {
      await api.post('/api/dashboard/events/test');
      setResult('sent');
    } catch {
      setResult('failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="setup-section">
      <h2>4. Try it</h2>
      <p className="setup-hint">Send a test event to your first application's endpoints, then check its delivery on the Events page.</p>
      {!ready && <p className="setup-blocked">Add an endpoint first.</p>}
      <div className="setup-row">
        <button className="btn-primary" onClick={handleSend} disabled={!ready || sending}>
          {sending ? 'Sending...' : 'Send test event'}
        </button>
        {result === 'sent' && (
          <button className="btn-secondary" onClick={onOpenEvents}>
            Sent — view it in Events
          </button>
        )}
      </div>
      {result === 'failed' && <p className="form-error">Couldn't send the test event — try again.</p>}
    </section>
  );
}

function Setup({ role, onOpenEvents, onLogout }) {
  const apps = useList('/api/dashboard/applications');
  const endpoints = useList('/api/dashboard/endpoints');
  const keys = useList('/api/api-keys');
  // A stale token can still say admin; the first 403 flips the page to read-only.
  const [forbidden, setForbidden] = useState(false);
  const writable = canWrite(role) && !forbidden;

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Setup</h1>
        <div>
          <button className="btn-secondary" onClick={onOpenEvents}>
            Events
          </button>
          <button className="btn-secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
      <Checklist apps={apps} endpoints={endpoints} keys={keys} />
      {!writable && (
        <p className="setup-readonly">Only owners and admins can create applications, endpoints and API keys.</p>
      )}
      <ApplicationsSection apps={apps} writable={writable} onForbidden={() => setForbidden(true)} />
      <EndpointsSection apps={apps} endpoints={endpoints} writable={writable} onForbidden={() => setForbidden(true)} />
      <ApiKeysSection keys={keys} writable={writable} onForbidden={() => setForbidden(true)} />
      <TryItSection endpoints={endpoints} onOpenEvents={onOpenEvents} />
    </div>
  );
}

export default Setup;
