// src/services/backgroundService.js
import * as BackgroundFetch  from 'expo-background-fetch';
import * as TaskManager      from 'expo-task-manager';
import * as Notifications    from 'expo-notifications';
import AsyncStorage          from '@react-native-async-storage/async-storage';
import { fetchValidations }  from './supabase';

export const HEARTBEAT_TASK      = 'cardvalidator-heartbeat';
export const FOREGROUND_SVC_TASK = 'cardvalidator-foreground-service';
const LAST_SEEN_KEY              = 'cv_last_seen_id';

// ── Foreground-service notification channel ────────────────────
const FG_CHANNEL_ID = 'card-validator-fg-service';

async function ensureFgChannel() {
  await Notifications.setNotificationChannelAsync(FG_CHANNEL_ID, {
    name:       'Background Service',
    importance: Notifications.AndroidImportance.LOW,   // silent — stays in tray
    sound:      null,
    vibrationPattern: [],
    enableVibrate: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
  });
}

// ── Foreground-service persistent notification ─────────────────
async function showForegroundServiceNotification() {
  await ensureFgChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title:       'CardValidator Admin — Running',
      body:        'Monitoring card validations in the background…',
      sticky:      true,          // cannot be dismissed by user swipe
      ongoing:     true,
      priority:    'low',
      data:        { type: 'foreground-service' },
      android: {
        channelId:  FG_CHANNEL_ID,
        color:      '#7c6dfa',
        smallIcon:  '@mipmap/ic_launcher',
        ongoing:    true,
        sticky:     true,
        priority:   'low',
        visibility: 'secret',
      },
    },
    trigger: null,
  });
}

// ── Headless JS / background task (runs even when app is closed) ─
TaskManager.defineTask(FOREGROUND_SVC_TASK, async () => {
  try {
    await pollForNewValidations();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── Background-fetch heartbeat (supplemental 30-s polling) ───────
TaskManager.defineTask(HEARTBEAT_TASK, async () => {
  try {
    await pollForNewValidations();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── Shared polling logic ──────────────────────────────────────────
async function pollForNewValidations() {
  const validations = await fetchValidations({ limit: 5 });
  if (!validations || validations.length === 0) return;

  const lastSeenId = await AsyncStorage.getItem(LAST_SEEN_KEY);
  const newest     = validations[0];

  if (newest.id !== lastSeenId) {
    await AsyncStorage.setItem(LAST_SEEN_KEY, newest.id);

    const settings = await getNotificationSettings();
    const shouldNotify =
      (newest.status === 'valid'   && settings.onValid)   ||
      (newest.status === 'used'    && settings.onUsed)    ||
      (newest.status === 'invalid' && settings.onInvalid);

    if (settings.enabled && shouldNotify) {
      await sendNotification(newest);
    }
  }
}

// ── Register background running ───────────────────────────────────
export async function registerHeartbeat() {
  // 1. Show the persistent foreground-service notification so Android
  //    promotes the JS background task to a real foreground service
  //    (prevents the OS from killing it after a few minutes).
  await showForegroundServiceNotification();

  // 2. Register background-fetch task (fires on OS schedule, ~30s min)
  const status = await BackgroundFetch.getStatusAsync();
  const denied =
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied;

  if (!denied) {
    // Unregister first to avoid duplicate-task errors on re-register
    const alreadyRegistered =
      await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
    if (alreadyRegistered) {
      await BackgroundFetch.unregisterTaskAsync(HEARTBEAT_TASK);
    }

    await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, {
      minimumInterval: 30,    // seconds (Android ignores values < 15 min in Doze)
      stopOnTerminate: false, // keep running after app is swiped away
      startOnBoot:     true,  // restart after device reboot
    });
    console.log('[Heartbeat] Background-fetch task registered');
  } else {
    console.warn('[Heartbeat] Background fetch not available on this device');
  }
}

export async function unregisterHeartbeat() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(HEARTBEAT_TASK);
  }
  // Dismiss the persistent foreground-service notification
  await Notifications.dismissAllNotificationsAsync();
  console.log('[Heartbeat] Stopped');
}

// ── Notification handler ──────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    priority:        Notifications.AndroidNotificationPriority.MAX,
  }),
});

// ── Send alert notification ───────────────────────────────────────
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
        channelId: 'card-validations',
        priority:  'max',
        color:     '#7c6dfa',
        largeIcon: '@mipmap/ic_launcher',
      },
    },
    trigger: null,
  });
}

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

// ── Create alert notification channel ────────────────────────────
export async function setupNotificationChannel() {
  const settings = await getNotificationSettings();
  const soundFile =
    settings.customSound && settings.customSound !== 'default'
      ? `${settings.customSound}.mp3`
      : null;

  await Notifications.deleteNotificationChannelAsync('card-validations');
  await Notifications.setNotificationChannelAsync('card-validations', {
    name:                 'Card Validations',
    description:          'Alerts when users validate cards',
    importance:           Notifications.AndroidImportance.MAX,
    sound:                soundFile,
    vibrationPattern:     [0, 250, 100, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd:            true,
  });
}

// ── Permission request ─────────────────────────────────────────────
export async function requestPermissions() {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return status === 'granted';
}
