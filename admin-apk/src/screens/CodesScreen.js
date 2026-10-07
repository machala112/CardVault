// src/screens/CodesScreen.js — Manage voucher codes
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { fetchCodes, addCode, deleteCode } from '../services/api';
import { colors, typography, shadows, borderRadius } from '../theme';

export default function CodesScreen() {
  const insets = useSafeAreaInsets();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchCodes();
      setCodes(rows || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const clean = newCode.trim().toUpperCase();
    if (!clean) {
      Alert.alert('Enter a code', 'Please type the voucher code to add.');
      return;
    }
    setAdding(true);
    try {
      await addCode(clean, '');
      setNewCode('');
      await load();
    } catch (e) {
      Alert.alert('Failed', e.message || 'Could not add code.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (id, code) => {
    Alert.alert(
      'Delete Code',
      `Remove "${code}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCode(id);
              await load();
            } catch (e) {
              Alert.alert('Failed', e.message);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item, index }) => (
    <Animated.View entering={FadeInDown.delay(index * 50)}>
      <View style={styles.row}>
        <View style={[
          styles.statusBadge,
          { backgroundColor: item.is_used ? colors.warn + '18' : colors.success + '18' }
        ]}>
          <Ionicons
            name={item.is_used ? 'time-outline' : 'checkmark-circle-outline'}
            size={22}
            color={item.is_used ? colors.warn : colors.success}
          />
        </View>
        <View style={styles.info}>
          <Text style={styles.code}>{item.code}</Text>
          <Text style={styles.meta}>
            {item.is_used ? `Used ${item.used_at?.slice(0, 10) || ''}` : 'Unused'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item.id, item.code)}
          hitSlop={12}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Add code */}
      <View style={styles.addWrap}>
        <View style={styles.inputWrap}>
          <Ionicons name="ticket-outline" size={20} color={colors.text3} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            placeholder="Enter voucher code"
            placeholderTextColor={colors.text3}
            value={newCode}
            onChangeText={setNewCode}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
        </View>
        <TouchableOpacity
          style={[styles.addBtn, adding && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={adding}
        >
          {adding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="add" size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Count */}
      <View style={styles.countRow}>
        <Ionicons name="layers-outline" size={16} color={colors.text2} />
        <Text style={styles.countText}>
          {codes.length} code{codes.length !== 1 ? 's' : ''} · {codes.filter(c => !c.is_used).length} unused
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={codes}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="ticket-outline" size={48} color={colors.text3} />
              </View>
              <Text style={styles.emptyTitle}>No codes yet</Text>
              <Text style={styles.emptyText}>Add your voucher codes above to start.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addWrap: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: borderRadius.md, paddingHorizontal: 14, height: 52,
  },
  input: {
    flex: 1, color: colors.text1,
    fontFamily: 'monospace', fontSize: 16, fontWeight: '600',
    letterSpacing: 1,
  },
  addBtn: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    ...shadows.glow(colors.accent),
  },
  addBtnDisabled: { opacity: 0.6 },
  countRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingBottom: 8,
  },
  countText: { color: colors.text2, fontSize: 13, fontFamily: typography.body },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.glassBorder,
    padding: 14, marginBottom: 10,
  },
  statusBadge: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  info: { flex: 1 },
  code: {
    color: colors.text1, fontFamily: 'monospace',
    fontSize: 16, fontWeight: '700', letterSpacing: 1.5,
  },
  meta: { color: colors.text3, fontSize: 12, marginTop: 4, fontFamily: typography.body },
  deleteBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: colors.danger + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 24,
    backgroundColor: colors.bgCard,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { color: colors.text1, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  emptyText: { color: colors.text3, fontSize: 13, textAlign: 'center', fontFamily: typography.body },
});
