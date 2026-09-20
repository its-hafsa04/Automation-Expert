import { useCallback, useEffect, useState } from 'react';
import { fetchQualification, submitLead } from './api';
import { useAuth } from './AuthContext';
import './App.css';

const EMPTY_FORM = {
  name: '',
  email: '',
  company: '',
  message: '',
};

const PROCESSING_STEPS = [
  { key: 'aiProcessed', label: 'AI qualification' },
  { key: 'crmContactProcessed', label: 'CRM contact' },
  { key: 'crmStageProcessed', label: 'CRM stage' },
  { key: 'notificationProcessed', label: 'High-priority notification' },
];

function statusLabel(qualification) {
  if (!qualification) return '';
  if (qualification.processingStatus === 'FAILED') return 'Failed';
  if (qualification.aiProcessed) return 'Complete';
  return 'Processing';
}

function statusClass(qualification) {
  if (!qualification) return 'pending';
  if (qualification.processingStatus === 'FAILED') return 'failed';
  if (qualification.aiProcessed) return 'done';
  return 'pending';
}

function App() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');

  const [activeLeadId, setActiveLeadId] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [qualification, setQualification] = useState(null);
  const [qualError, setQualError] = useState('');
  const [polling, setPolling] = useState(false);

  const loadQualification = useCallback(async (leadId, { silent = false } = {}) => {
    if (!leadId.trim()) return;
    if (!silent) setQualError('');
    try {
      const data = await fetchQualification(leadId.trim());
      setQualification(data);
      return data;
    } catch (err) {
      setQualification(null);
      if (!silent) setQualError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!activeLeadId) {
      setPolling(false);
      return undefined;
    }

    let cancelled = false;
    let timer;

    const tick = async () => {
      try {
        const data = await loadQualification(activeLeadId, { silent: true });
        if (cancelled || !data) return;
        const finished =
          data.processingStatus === 'FAILED' ||
          (data.aiProcessed &&
            data.crmContactProcessed &&
            data.crmStageProcessed &&
            (data.priority !== 'HIGH' || data.notificationProcessed));
        if (!finished) {
          timer = window.setTimeout(tick, 2500);
        } else {
          setPolling(false);
        }
      } catch {
        if (!cancelled) {
          setPolling(false);
          setQualError('Could not load qualification status.');
        }
      }
    };

    setPolling(true);
    tick();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeLeadId, loadQualification]);

  const onFieldChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');
    setQualError('');
    setQualification(null);

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || undefined,
      message: form.message.trim() || undefined,
    };

    try {
      const result = await submitLead(payload);
      const leadId = result.leadId;
      setActiveLeadId(leadId);
      setLookupId(leadId);
      setSubmitMessage(result.message || 'Lead submitted successfully.');
      setForm(EMPTY_FORM);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onLookup = async (event) => {
    event.preventDefault();
    setActiveLeadId(lookupId.trim());
    setQualError('');
    try {
      await loadQualification(lookupId);
    } catch {
      /* error state set in loadQualification */
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-bar">
          <p className="eyebrow">Lead automation</p>
          <div className="session">
            <span className="session-email">{user?.email}</span>
            <button type="button" className="secondary session-logout" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
        <h1>Submit & track leads</h1>
        <p className="subtitle">
          Submit leads from your account and watch AI qualification and CRM processing in real time.
        </p>
      </header>

      <main className="layout">
        <section className="card">
          <h2>New lead</h2>
          <form className="form" onSubmit={onSubmit}>
            <label>
              Name
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={onFieldChange('name')}
                required
                autoComplete="name"
                placeholder="Jane Doe"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={onFieldChange('email')}
                required
                autoComplete="email"
                placeholder="jane@company.com"
              />
            </label>
            <label>
              Company <span className="optional">(optional)</span>
              <input
                type="text"
                name="company"
                value={form.company}
                onChange={onFieldChange('company')}
                autoComplete="organization"
                placeholder="Acme Inc."
              />
            </label>
            <label>
              Message
              <textarea
                name="message"
                value={form.message}
                onChange={onFieldChange('message')}
                rows={4}
                required
                placeholder="What are they looking for?"
              />
            </label>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit lead'}
            </button>
          </form>
          {submitMessage && <p className="banner success">{submitMessage}</p>}
          {submitError && <p className="banner error">{submitError}</p>}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Qualification status</h2>
            {activeLeadId && (
              <span className={`pill ${statusClass(qualification)}`}>
                {statusLabel(qualification) || 'Loading…'}
                {polling ? ' · updating' : ''}
              </span>
            )}
          </div>

          <form className="lookup" onSubmit={onLookup}>
            <label>
              Lead ID
              <input
                type="text"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                placeholder="Paste a lead UUID"
              />
            </label>
            <button type="submit" className="secondary">
              Load status
            </button>
          </form>

          {qualError && <p className="banner error">{qualError}</p>}

          {qualification && (
            <div className="qualification">
              <dl className="meta">
                <div>
                  <dt>Lead ID</dt>
                  <dd className="mono">{qualification.id}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{qualification.priority ?? '—'}</dd>
                </div>
                <div>
                  <dt>Processing</dt>
                  <dd>{qualification.processingStatus}</dd>
                </div>
                <div>
                  <dt>Attempts</dt>
                  <dd>{qualification.processingAttempts ?? 0}</dd>
                </div>
              </dl>

              <ul className="steps">
                {PROCESSING_STEPS.map(({ key, label }) => (
                  <li key={key} className={qualification[key] ? 'done' : 'pending'}>
                    <span className="dot" aria-hidden />
                    {label}
                  </li>
                ))}
              </ul>

              {qualification.aiSummary && (
                <div className="detail">
                  <h3>AI summary</h3>
                  <p>{qualification.aiSummary}</p>
                </div>
              )}
              {qualification.aiReason && (
                <div className="detail">
                  <h3>AI reason</h3>
                  <p>{qualification.aiReason}</p>
                </div>
              )}
              {qualification.followUpMessage && (
                <div className="detail">
                  <h3>Suggested follow-up</h3>
                  <p>{qualification.followUpMessage}</p>
                </div>
              )}
              {qualification.lastError && (
                <div className="detail error-box">
                  <h3>Last error</h3>
                  <p className="mono">{qualification.lastErrorType}: {qualification.lastError}</p>
                </div>
              )}
            </div>
          )}

          {!qualification && !qualError && !activeLeadId && (
            <p className="muted">Submit a lead or enter an ID to see qualification details.</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
