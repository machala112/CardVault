// index.js — app entry point
import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and ensures the correct environment is set up for Expo Go, standalone APK, etc.
registerRootComponent(App);
