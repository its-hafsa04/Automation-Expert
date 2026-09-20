import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import AuthScreen from './AuthScreen.jsx';
import { AuthProvider, useAuth } from './AuthContext.jsx';

function AppGate() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="loading-screen">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  </StrictMode>
);
