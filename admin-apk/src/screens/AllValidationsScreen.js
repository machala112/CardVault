// src/screens/AllValidationsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchValidations } from '../services/supabase';
import ValidationRow from '../components/ValidationRow';
import { colors, typography } from '../theme';

const FILTERS = ['all', 'valid', 'used', 'invalid'];

export default function AllValidationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [data,     setData]     = useState([]);
  const [filter,   setFilter]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [refresh,  setRefresh]  = useState(false);

  const load = useCallback(async () => {
    setRefresh(true);
    try {
      const rows = await fetchValidations({ limit: 200, status: filter === 'all' ? null : filter });
      setData(rows);
    } finally { setRefresh(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? data.filter(v => v.card_code.toLowerCase().includes(search.toLowerCase()))
    : data;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by code…"
          placeholderTextColor={colors.text3}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.pill, filter === f && styles.pillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.pillText, filter === f && styles.pillTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <ValidationRow
            validation={item}
            onPress={() => navigation.navigate('ValidationDetail', { validation: item })}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={load} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 32 }}>📭</Text>
            <Text style={styles.emptyText}>No validations found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: colors.bg },
  searchWrap:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.glass, margin: 16, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.glassBorder },
  searchIcon:     { fontSize: 16, marginRight: 8 },
  searchInput:    { flex: 1, height: 44, color: colors.text1, fontFamily: typography.body, fontSize: 14 },
  filterRow:      { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  pill:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
  pillActive:     { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText:       { color: colors.text2, fontSize: 13, fontFamily: typography.body },
  pillTextActive: { color: '#fff', fontWeight: '600' },
  empty:          { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:      { color: colors.text3, fontFamily: typography.body, fontSize: 14 },
});
