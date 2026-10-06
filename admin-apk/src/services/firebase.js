// src/services/firebase.js — Firebase Auth bootstrap (singleton)
//
// The Firebase web config is NOT bundled: it is fetched once at startup
// from the Worker (GET /api/config, public). The Firebase JS SDK then
// persists the auth session itself via AsyncStorage — there is no custom
// token storage anywhere.
//
// Usage:
//   import { auth, ready } from './firebase';
//   await ready;                 // init done (config fetched, app initialized)
//   auth.currentUser             // firebase User | null
//
// Singleton: the module-level promise is created once, so initializeApp /
// initializeAuth never run twice (also safe under Fast Refresh via the
// getApps() guard).
import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');

/** The initialized Firebase Auth instance. Null until `ready` resolves. */
export let auth = null;

/** Resolves when Firebase is initialized; rejects if the config can't load. */
export const ready = (async () => {
  if (!BASE_URL) {
    throw new Error('API URL not configured — set EXPO_PUBLIC_API_URL');
  }
  const res = await fetch(`${BASE_URL}/api/config`);
  if (!res.ok) {
    throw new Error(`Could not load Firebase config (${res.status})`);
  }
  const config = await res.json(); // { apiKey, authDomain, projectId }
  if (!config || !config.apiKey || !config.projectId) {
    throw new Error('Invalid Firebase config received from /api/config');
  }

  if (getApps().length > 0) {
    // Already initialized (e.g. Fast Refresh re-ran this module).
    auth = getAuth(getApps()[0]);
  } else {
    const app = initializeApp(config);
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
  return auth;
})();
