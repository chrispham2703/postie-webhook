import { useState } from 'react';
import Login from './Login';
import Register from './Register';
import EventList from './EventList';
import EventDetail from './EventDetail';
import { setToken } from './api';
import './App.css';

function App() {
  const [token, setTokenState] = useState(() => {
    const stored = localStorage.getItem('postie_token');
    if (stored) setToken(stored);
    return stored;
  });
  const [view, setView] = useState('login');
  const [selectedEventId, setSelectedEventId] = useState(null);

  function handleAuth(newToken) {
    localStorage.setItem('postie_token', newToken);
    setToken(newToken);
    setTokenState(newToken);
  }

  function handleLogout() {
    localStorage.removeItem('postie_token');
    setToken(null);
    setTokenState(null);
    setView('login');
  }

  if (!token) {
    return view === 'login' ? (
      <Login onLogin={handleAuth} onToggle={() => setView('register')} />
    ) : (
      <Register onRegister={handleAuth} onToggle={() => setView('login')} />
    );
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

  return <EventList onLogout={handleLogout} onSelectEvent={setSelectedEventId} />;
}

export default App;
