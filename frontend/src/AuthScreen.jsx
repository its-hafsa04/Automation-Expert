import { useState } from 'react';
import { useAuth } from './AuthContext';
import './AuthScreen.css';

const EMPTY_LOGIN = { email: '', password: '' };
const EMPTY_REGISTER = { name: '', email: '', password: '', confirm: '' };

export default function AuthScreen() {
  const { login, register, setAuthError, authError } = useAuth();
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState(EMPTY_LOGIN);
  const [registerForm, setRegisterForm] = useState(EMPTY_REGISTER);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setAuthError('');
  };

  const onLoginSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setAuthError('');
    try {
      await login({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onRegisterSubmit = async (event) => {
    event.preventDefault();
    if (registerForm.password !== registerForm.confirm) {
      setAuthError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setAuthError('');
    try {
      await register({
        email: registerForm.email.trim(),
        password: registerForm.password,
        name: registerForm.name.trim() || undefined,
      });
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Lead automation</p>
        <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Access the dashboard to submit leads and track AI qualification.'
            : 'Register to submit leads and view processing status.'}
        </p>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        {mode === 'login' ? (
          <form className="auth-form" onSubmit={onLoginSubmit}>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={loginForm.email}
                onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={loginForm.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={onRegisterSubmit}>
            <label>
              Name <span className="optional">(optional)</span>
              <input
                type="text"
                autoComplete="name"
                value={registerForm.name}
                onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={registerForm.email}
                onChange={(e) => setRegisterForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={registerForm.password}
                onChange={(e) => setRegisterForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={registerForm.confirm}
                onChange={(e) => setRegisterForm((f) => ({ ...f, confirm: e.target.value }))}
              />
            </label>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}

        {authError && <p className="banner error">{authError}</p>}
      </div>
    </div>
  );
}
