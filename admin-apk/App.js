// App.js — CardValidator Admin Entry
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';

import DashboardScreen        from './src/screens/DashboardScreen';
import AllValidationsScreen   from './src/screens/AllValidationsScreen';
import SettingsScreen         from './src/screens/SettingsScreen';
import ValidationDetailScreen from './src/screens/ValidationDetailScreen';
import AuthScreen             from './src/screens/AuthScreen';

import { ready, auth } from './src/services/firebase';
import { syncUser } from './src/services/api';
import {
  setupNotificationChannel,
  requestPermissions,
  registerForPushNotifications,
  addPushListener,
} from './src/services/notifications';
import { colors } from './src/theme';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card:       'rgba(13,15,30,0.95)',
    border:     'rgba(255,255,255,0.08)',
    text:       colors.text1,
    primary:    colors.accent,
  },
};

function TabIcon({ emoji, focused }) {
  return (
    <View style={[tabIconStyles.wrap, focused && tabIconStyles.wrapActive]}>
      <Text style={tabIconStyles.icon}>{emoji}</Text>
    </View>
  );
}
const tabIconStyles = StyleSheet.create({
  wrap:       { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  wrapActive: { backgroundColor: 'rgba(124,109,250,0.2)' },
  icon:       { fontSize: 18 },
});

function MainTabs({ onSignOut }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown:         false,
        tabBarStyle: {
          backgroundColor:   'rgba(13,15,30,0.95)',
          borderTopColor:    'rgba(255,255,255,0.08)',
          borderTopWidth:    1,
          paddingBottom:     8,
          paddingTop:        8,
          height:            70,
        },
        tabBarActiveTintColor:   colors.accent,
        tabBarInactiveTintColor: colors.text3,
        tabBarLabelStyle:        { fontSize: 11, marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tab.Screen
        name="AllValidations"
        component={AllValidationsScreen}
        options={{ title: 'Validations', tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} /> }}
      />
      <Tab.Screen name="Settings" options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} /> }}>
        {() => <SettingsScreen onSignOut={onSignOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [authState, setAuthState] = useState('loading'); // 'loading' | 'authed' | 'guest'
  // UID the push setup has already run for — avoids double registration when
  // both the AuthScreen onAuth callback and the Firebase listener fire.
  const pushedUidRef = useRef(null);

  // Set up push channels, permissions, FCM token registration
  const initPush = useCallback(async () => {
    await setupNotificationChannel();
    const granted = await requestPermissions();
    if (granted) {
      await registerForPushNotifications();
    }
  }, []);

  const initPushFor = useCallback(async (uid) => {
    if (pushedUidRef.current === uid) return;
    pushedUidRef.current = uid;
    await initPush();
  }, [initPush]);

  // Foreground push listener — registered once for the app lifetime
  useEffect(() => {
    const sub = addPushListener();
    return () => sub.remove();
  }, []);

  // Firebase session restore on launch: once init is ready, the auth-state
  // listener fires immediately with the persisted user (or null).
  useEffect(() => {
    let unsub = null;
    let cancelled = false;
    (async () => {
      try {
        await ready;
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, async (fbUser) => {
          if (cancelled) return;
          if (fbUser) {
            try {
              const { user } = await syncUser(); // POST /api/auth/sync
              if (cancelled) return;
              setAuthState('authed');
              await initPushFor(user && user.id ? user.id : fbUser.uid);
            } catch (e) {
              console.warn('[Auth] Backend sync failed:', e.message);
              if (!cancelled) setAuthState('guest');
            }
          } else {
            pushedUidRef.current = null;
            setAuthState('guest');
          }
        });
      } catch (e) {
        console.warn('[Auth] Firebase init failed:', e.message);
        if (!cancelled) setAuthState('guest');
      }
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [initPushFor]);

  const handleAuth = useCallback(async (user) => {
    setAuthState('authed');
    await initPushFor(user && user.id ? user.id : null);
  }, [initPushFor]);

  const handleSignOut = useCallback(() => {
    pushedUidRef.current = null;
    setAuthState('guest');
  }, []);

  if (authState === 'loading') {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <NavigationContainer theme={NAV_THEME}>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            {authState === 'authed' ? (
              <>
                <Stack.Screen name="Main">
                  {() => <MainTabs onSignOut={handleSignOut} />}
                </Stack.Screen>
                <Stack.Screen
                  name="ValidationDetail"
                  component={ValidationDetailScreen}
                  options={{ headerShown: true, title: 'Validation Detail', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text1 }}
                />
              </>
            ) : (
              <Stack.Screen name="Auth">
                {() => <AuthScreen onAuth={handleAuth} />}
              </Stack.Screen>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingRoot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
