// index.js — Headless JS entry point
//
// React Native calls this file (instead of App.js) when the app is
// launched in the background by the OS (e.g. after a reboot, or when
// the background-fetch / foreground-service task wakes it up).
//
// TaskManager tasks must be defined BEFORE the app registers itself,
// so we import backgroundService first — it calls TaskManager.defineTask
// for both HEARTBEAT_TASK and FOREGROUND_SVC_TASK at module-load time.

import './src/services/backgroundService';

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and ensures the correct environment is set up for Expo Go, standalone APK, etc.
registerRootComponent(App);
