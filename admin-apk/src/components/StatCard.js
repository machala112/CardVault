// src/components/StatCard.js — Premium stat card with vector icon
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, typography, shadows, borderRadius } from '../theme';

const ICONS = {
  total:   'analytics-outline',
  valid:   'checkmark-circle-outline',
  used:    'time-outline',
  invalid: 'close-circle-outline',
};

export default function StatCard({ label, value, color, iconKey, index = 0 }) {
  const iconName = ICONS[iconKey] || 'stats-chart-outline';

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={[styles.wrapper, shadows.card]}
    >
      <LinearGradient
        colors={[color + '26', color + '0D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: color + '40' }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: color + '30' }]}>
          <Ionicons name={iconName} size={22} color={color} />
        </View>
        <Text style={styles.value}>{value.toLocaleString()}</Text>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.accentBar, { backgroundColor: color }]} />
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: borderRadius.lg,
  },
  card: {
    width: 138,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  value: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text1,
    fontFamily: typography.display,
    letterSpacing: -0.5,
  },
  label: {
    color: colors.text2,
    fontSize: 12,
    fontWeight: '500',
    fontFamily: typography.body,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.lg,
  },
});
