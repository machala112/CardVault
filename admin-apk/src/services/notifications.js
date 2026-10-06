// src/services/notifications.js — Local notification channels, settings,
// and Firebase Cloud Messaging (FCM) push wiring.
//
// Push flow: the backend sends FCM messages with
// android.notification.channel_id = 'card-validations' (see
// setupNotificationChannel below). While the app is in the foreground,
// incoming pushes are re-presented as local notifications here so the
// user's in-app settings (enabled / per-status / sound / vibrate) apply.
// In the background the OS displays them directly on the channel.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerPushToken } from './api';

// ── Alert channel — the backend targets this exact channel ID ─────
export const ALERT_CHANNEL_ID = 'card-validations';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    priority:        Notifications.AndroidNotificationPriority.MAX,
  }),
});

// ── Notification settings helpers ─────────────────────────────────
const SETTINGS_KEY = 'cv_notif_settings';
export const DEFAULT_SETTINGS = {
  enabled:      true,
  soundEnabled: true,
  customSound:  'hardcore',
  vibrate:      true,
  onValid:      true,
  onUsed:       true,
  onInvalid:    true,
};

export async function getNotificationSettings() {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
}

export async function saveNotificationSettings(settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Create (or recreate) the alert notification channel ───────────
export async function setupNotificationChannel() {
  const settings = await getNotificationSettings();
  const soundFile =
    settings.customSound && settings.customSound !== 'default'
      ? `${settings.customSound}.mp3`
      : null;

  await Notifications.deleteNotificationChannelAsync(ALERT_CHANNEL_ID);
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name:                 'Card Validations',
    description:          'Alerts when users validate cards',
    importance:           Notifications.AndroidImportance.MAX,
    sound:                soundFile,
    vibrationPattern:     [0, 250, 100, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd:            true,
  });
}

// ── Permission request ────────────────────────────────────────────
export async function requestPermissions() {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return status === 'granted';
}

// ── Register this device's FCM token with the backend ─────────────
export async function registerForPushNotifications() {
  try {
    const pushToken = await Notifications.getDevicePushTokenAsync();
    // { type: 'android', data: '<FCM registration token>' }
    await registerPushToken(pushToken.data, 'android');
    console.log('[Push] Device token registered with backend');
  } catch (e) {
    console.warn('[Push] Could not register device token:', e.message);
  }
}

// ── Foreground push listener: present as a local notification ─────
export function addPushListener() {
  return Notifications.addNotificationReceivedListener(async (notification) => {
    const settings = await getNotificationSettings();
    if (!settings.enabled) return;

    const data   = notification.request.content.data || {};
    const status = data.status;
    const allowed =
      (status === 'valid'   && settings.onValid)   ||
      (status === 'used'    && settings.onUsed)    ||
      (status === 'invalid' && settings.onInvalid) ||
      !status; // no status in payload → show it if notifications are on

    if (!allowed) return;

    const statusLabels = { valid: '✅ Valid', used: '⚠️ Used', invalid: '❌ Invalid' };
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.request.content.title ||
               `New Card Validation — ${statusLabels[status] || '🔍'}`,
        body:  notification.request.content.body ||
               (data.card_code ? `Code: ${data.card_code}` : 'A card was just validated.'),
        data:  { validationId: data.validation_id || data.validationId },
        sound: settings.soundEnabled
          ? (settings.customSound && settings.customSound !== 'default'
              ? `${settings.customSound}.mp3`
              : true)
          : false,
        badge:   1,
        priority: 'max',
        vibrate: settings.vibrate ? [0, 250, 100, 250] : undefined,
        android: {
          channelId: ALERT_CHANNEL_ID,
          priority:  'max',
          color:     '#7c6dfa',
          largeIcon: '@mipmap/ic_launcher',
        },
      },
      trigger: null,
    });
  });
}

// ── Manual test alert (Settings screen) ───────────────────────────
export async function sendNotification(validation) {
  const settings     = await getNotificationSettings();
  const statusLabels = { valid: '✅ Valid', used: '⚠️ Used', invalid: '❌ Invalid' };
  const label        = statusLabels[validation.status] || '🔍 Unknown';

  await Notifications.scheduleNotificationAsync({
    content: {
      title:    `New Card Validation — ${label}`,
      body:     `Code: ${validation.card_code}`,
      data:     { validationId: validation.id },
      sound:    settings.soundEnabled ? settings.customSound || true : false,
      badge:    1,
      priority: 'max',
      vibrate:  settings.vibrate ? [0, 250, 100, 250] : undefined,
      android: {
        channelId: ALERT_CHANNEL_ID,
        priority:  'max',
        color:     '#7c6dfa',
        largeIcon: '@mipmap/ic_launcher',
      },
    },
    trigger: null,
  });
}
