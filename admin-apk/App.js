// App.js — CardValidator Admin Entry
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text, View, StyleSheet } from 'react-native';

import DashboardScreen       from './src/screens/DashboardScreen';
import AllValidationsScreen  from './src/screens/AllValidationsScreen';
import SettingsScreen        from './src/screens/SettingsScreen';
import ValidationDetailScreen from './src/screens/ValidationDetailScreen';

import {
  registerHeartbeat,
  requestPermissions,
  setupNotificationChannel,
} from './src/services/backgroundService';
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

function MainTabs() {
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
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    async function init() {
      await setupNotificationChannel();
      const granted = await requestPermissions();
      if (granted) {
        await registerHeartbeat();
      }
    }
    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <NavigationContainer theme={NAV_THEME}>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="ValidationDetail"
              component={ValidationDetailScreen}
              options={{ headerShown: true, title: 'Validation Detail', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text1 }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
