import { useEffect, useState } from 'react';
import Login from './Login';
import Register from './Register';
import EventList from './EventList';
import EventDetail from './EventDetail';
import Setup from './Setup';
import api, { setToken } from './api';
import { getRole } from './auth';
import './App.css';

function App() {
  const [token, setTokenState] = useState(() => {
    const stored = localStorage.getItem('postie_token');
    if (stored) setToken(stored);
    return stored;
  });
  const [view, setView] = useState('login');
  const [selectedEventId, setSelectedEventId] = useState(null);
  // No router: two top-level pages, switched in state (docs/ONBOARDING_UI.md §3.1).
  const [page, setPage] = useState(null);

  // Landing rule: an org with no applications yet opens on Setup, everyone
  // else on Events.
  useEffect(() => {
    if (!token || page) return;
    let cancelled = false;
    api
      .get('/api/dashboard/applications')
      .then((res) => {
        if (!cancelled) setPage(res.data.data.length === 0 ? 'setup' : 'events');
      })
      .catch(() => {
        if (!cancelled) setPage('events');
      });
    return () => {
      cancelled = true;
    };
  }, [token, page]);

  function handleAuth(newToken) {
    localStorage.setItem('postie_token', newToken);
    setToken(newToken);
    setTokenState(newToken);
    setPage(null);
  }

  function handleLogout() {
    localStorage.removeItem('postie_token');
    setToken(null);
    setTokenState(null);
    setView('login');
    setPage(null);
  }

  if (!token) {
    return view === 'login' ? (
      <Login onLogin={handleAuth} onToggle={() => setView('register')} />
    ) : (
      <Register onRegister={handleAuth} onToggle={() => setView('login')} />
    );
  }

  if (!page) {
    return <p className="dashboard-status">Loading...</p>;
  }

  if (page === 'setup') {
    return <Setup role={getRole(token)} onOpenEvents={() => setPage('events')} onLogout={handleLogout} />;
  }

  if (selectedEventId) {
    return (
      <EventDetail
        eventId={selectedEventId}
        onBack={() => setSelectedEventId(null)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <EventList
      onLogout={handleLogout}
      onSelectEvent={setSelectedEventId}
      onOpenSetup={() => setPage('setup')}
    />
  );
}

export default App;
