// src/components/StatCard.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../theme';

export default function StatCard({ label, value, color, icon }) {
  return (
    <View style={[styles.card, { borderColor: color + '33' }]}>
      <View style={[styles.iconWrap, { backgroundColor: color + '20' }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={[styles.value, { color }]}>{value.toLocaleString()}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width:           130,
    backgroundColor: colors.glass,
    borderRadius:    16,
    borderWidth:     1,
    padding:         16,
    gap:             8,
  },
  iconWrap: {
    width:        38,
    height:       38,
    borderRadius: 10,
    alignItems:   'center',
    justifyContent: 'center',
  },
  icon:  { fontSize: 18 },
  value: { fontSize: 28, fontWeight: '700', fontFamily: typography.display },
  label: { color: colors.text3, fontSize: 12, fontFamily: typography.body },
});
