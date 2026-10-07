// Firebase Cloud Messaging via the HTTP v1 API.
// The service-account JSON is stored as the FCM_SERVICE_ACCOUNT_JSON secret.
// We mint a short-lived OAuth2 access token with RS256 (WebCrypto) and cache it.

import { queryUserDb } from './userdb.js';

const enc = new TextEncoder();
let cached = null; // { accessToken, projectId, expiresAt }

function pemToDer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, '')
                 .replace(/-----END [^-]+-----/g, '')
                 .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function mintAccessToken(serviceAccount) {
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);

  const iat = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp: iat + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const jwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    projectId: serviceAccount.project_id,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };
}

async function getCredentials(env) {
  if (cached && cached.expiresAt > Date.now()) return cached;
  const raw = env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON secret is not set');
  cached = await mintAccessToken(JSON.parse(raw));
  return cached;
}

// Sends a push to a specific user's registered devices. Never throws —
// a notification failure must not break the validation response.
export async function sendValidationPush(env, dbId, { title, body }) {
  try {
    const { accessToken, projectId } = await getCredentials(env);
    const rows = await queryUserDb(env, dbId, 'SELECT token FROM push_tokens');
    const tokens = rows.map(r => r.token);
    await Promise.all(tokens.map(async (token) => {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                android: {
                  notification: {
                    channel_id: 'card-validations',
                    sound: 'default',
                  },
                },
              },
            }),
          });
        // Drop tokens FCM says are dead so the table stays clean.
        if (res.status === 404) {
          const detail = await res.text();
          if (/UNREGISTERED|NOT_FOUND/i.test(detail)) {
            await env.DB.prepare('DELETE FROM push_tokens WHERE token = ?')
              .bind(token).run();
          }
        }
      } catch { /* per-device failure is non-fatal */ }
    }));
  } catch (e) {
    console.error('FCM send failed:', e.message);
  }
}
