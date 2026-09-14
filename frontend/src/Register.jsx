import { useState } from 'react';
import api from './api';

function Register({ onRegister, onToggle }) {
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/api/auth/signup', { orgName, email, password });
      onRegister(res.data.data.token);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'EMAIL_TAKEN') {
        setError('An account with this email already exists.');
      } else if (code === 'VALIDATION_FAILED') {
        setError('Check your organization name, email, and password (8+ characters) and try again.');
      } else {
        setError('Registration failed — check your details and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create your account</h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Organization name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </form>
        <p className="auth-toggle">
          Already have an account?{' '}
          <button type="button" onClick={onToggle}>
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}

export default Register;
