import { useState } from 'react';
import Login from './Login';
import EventList from './EventList';
import { setToken } from './api';

function App() {
  const [token, setTokenState] = useState(() => {
    const stored = localStorage.getItem('postie_token');
    if (stored) setToken(stored);
    return stored;
  });

  function handleLogin(newToken) {
    localStorage.setItem('postie_token', newToken);
    setToken(newToken);
    setTokenState(newToken);
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return <EventList />;
}

export default App;
