import { getToken } from './authStorage';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://automation-expert-production.up.railway.app';

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data.error ||
      (Array.isArray(data.details) && data.details[0]?.message) ||
      res.statusText ||
      'Request failed';
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function register(payload) {
  return fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(parseJsonResponse);
}

export function login(payload) {
  return fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(parseJsonResponse);
}

export function fetchMe() {
  return fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(),
  }).then(parseJsonResponse);
}

export function submitLead(payload) {
  return fetch(`${API_BASE}/api/leads`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  }).then(parseJsonResponse);
}

export function fetchQualification(leadId) {
  return fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/qualification`, {
    headers: authHeaders(),
  }).then(parseJsonResponse);
}
