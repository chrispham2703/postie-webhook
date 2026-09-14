import { useState } from 'react';
import Login from './Login';
import Register from './Register';
import EventList from './EventList';
import { setToken } from './api';
import './App.css';

function App() {
  const [token, setTokenState] = useState(() => {
    const stored = localStorage.getItem('postie_token');
    if (stored) setToken(stored);
    return stored;
  });
  const [view, setView] = useState('login');

  function handleAuth(newToken) {
    localStorage.setItem('postie_token', newToken);
    setToken(newToken);
    setTokenState(newToken);
  }

  if (!token) {
    return view === 'login' ? (
      <Login onLogin={handleAuth} onToggle={() => setView('register')} />
    ) : (
      <Register onRegister={handleAuth} onToggle={() => setView('login')} />
    );
  }

  return <EventList />;
}

export default App;
