// src/components/ValidationRow.js — Premium validation row with vector icons
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { colors, typography, borderRadius } from '../theme';

const STATUS = {
  valid:   { icon: 'checkmark-circle', color: colors.success },
  used:    { icon: 'time',             color: colors.warn },
  invalid: { icon: 'close-circle',     color: colors.danger },
  pending: { icon: 'hourglass-outline', color: colors.text3 },
};

export default function ValidationRow({ validation: v, onPress }) {
  const s   = STATUS[v.status] || STATUS.pending;
  const ago = formatDistanceToNow(new Date(v.created_at), { addSuffix: true });

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.statusBadge, { backgroundColor: s.color + '18' }]}>
        <Ionicons name={s.icon} size={22} color={s.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.code} numberOfLines={1}>{v.card_code}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.statusPill, { backgroundColor: s.color + '20' }]}>
            <Text style={[styles.statusText, { color: s.color }]}>
              {v.status.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.ago}>{ago}</Text>
        </View>
      </View>
      {v.image_url ? (
        <Image source={{ uri: v.image_url }} style={styles.thumb} resizeMode="cover" />
      ) : null}
      <Ionicons name="chevron-forward" size={20} color={colors.text3} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 14,
    marginBottom: 10,
  },
  statusBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: { flex: 1 },
  code: {
    color: colors.text1,
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  ago: {
    color: colors.text3,
    fontSize: 11,
    fontFamily: typography.body,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 8,
  },
});
