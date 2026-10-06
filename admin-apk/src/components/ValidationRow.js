// src/components/ValidationRow.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { colors, typography } from '../theme';

const STATUS = {
  valid:   { emoji: '✅', color: colors.success },
  used:    { emoji: '⚠️', color: colors.warn },
  invalid: { emoji: '❌', color: colors.danger },
  pending: { emoji: '⏳', color: colors.text3 },
};

export default function ValidationRow({ validation: v, onPress }) {
  const s   = STATUS[v.status] || STATUS.pending;
  const ago = formatDistanceToNow(new Date(v.created_at), { addSuffix: true });

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.statusBadge, { backgroundColor: s.color + '20' }]}>
        <Text style={styles.statusEmoji}>{s.emoji}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.code} numberOfLines={1}>{v.card_code}</Text>
        <Text style={styles.meta}>{v.status.toUpperCase()} · {ago}</Text>
      </View>
      {v.image_url && (
        <Image
          source={{ uri: v.image_url }}
          style={styles.thumb}
          resizeMode="cover"
        />
      )}
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    backgroundColor: colors.glass,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     colors.glassBorder,
    padding:         14,
    marginBottom:    10,
  },
  statusBadge: {
    width:         40,
    height:        40,
    borderRadius:  12,
    alignItems:    'center',
    justifyContent:'center',
  },
  statusEmoji: { fontSize: 18 },
  info:        { flex: 1 },
  code:        { color: colors.text1, fontFamily: 'monospace', fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
  meta:        { color: colors.text3, fontSize: 11, marginTop: 3, fontFamily: typography.body },
  thumb:       { width: 40, height: 40, borderRadius: 8 },
  arrow:       { color: colors.text3, fontSize: 20 },
});
