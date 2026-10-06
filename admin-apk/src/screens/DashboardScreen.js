// src/screens/DashboardScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchValidations, fetchStats, subscribeToValidations } from '../services/supabase';
import { sendNotification } from '../services/backgroundService';
import { formatDistanceToNow } from 'date-fns';
import StatCard from '../components/StatCard';
import ValidationRow from '../components/ValidationRow';
import { colors, typography } from '../theme';

export default function DashboardScreen({ navigation }) {
  const insets     = useSafeAreaInsets();
  const [stats,    setStats]    = useState(null);
  const [recent,   setRecent]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [newFlash, setNewFlash] = useState(false);
  const flashAnim = React.useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([fetchStats(), fetchValidations({ limit: 20 })]);
      setStats(s);
      setRecent(v);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Realtime subscription
    const channel = subscribeToValidations(async (newVal) => {
      setRecent(prev => [newVal, ...prev].slice(0, 50));
      setStats(prev => prev ? {
        ...prev,
        total:   (prev.total   || 0) + 1,
        [newVal.status]: (prev[newVal.status] || 0) + 1,
      } : prev);
      // Flash effect
      setNewFlash(true);
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start(() => setNewFlash(false));
      await sendNotification(newVal);
    });
    return () => { channel.unsubscribe(); };
  }, []);

  const flashBg = flashAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(124,109,250,0)', 'rgba(124,109,250,0.15)'],
  });

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={colors.accent} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good {greeting()} 👋</Text>
          <Text style={styles.headTitle}>CardValidator Admin</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
          <Text style={{ fontSize: 22 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Live badge */}
      <Animated.View style={[styles.liveBadge, { backgroundColor: flashBg }]}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Live — Realtime Updates Active</Text>
      </Animated.View>

      {/* Stat cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsRow}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        <StatCard label="Total"   value={stats?.total   || 0} color={colors.accent}  icon="📊" />
        <StatCard label="Valid"   value={stats?.valid   || 0} color={colors.success} icon="✅" />
        <StatCard label="Used"    value={stats?.used    || 0} color={colors.warn}    icon="⚠️" />
        <StatCard label="Invalid" value={stats?.invalid || 0} color={colors.danger}  icon="❌" />
      </ScrollView>

      {/* Recent validations */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Validations</Text>
          <TouchableOpacity onPress={() => navigation.navigate('AllValidations')}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {recent.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No validations yet.</Text>
          </View>
        ) : (
          recent.map(v => (
            <ValidationRow
              key={v.id}
              validation={v}
              onPress={() => navigation.navigate('ValidationDetail', { validation: v })}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.bg },
  center:      { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.text2, marginTop: 12, fontFamily: typography.body },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  greeting:    { color: colors.text3, fontSize: 13, fontFamily: typography.body },
  headTitle:   { color: colors.text1, fontSize: 24, fontWeight: '700', fontFamily: typography.display, marginTop: 2 },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center' },
  liveBadge:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 20, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(124,109,250,0.2)' },
  liveDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveText:    { color: colors.text2, fontSize: 12, fontFamily: typography.body },
  statsRow:    { marginBottom: 28 },
  section:     { paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle:  { color: colors.text1, fontSize: 17, fontWeight: '600', fontFamily: typography.display },
  seeAll:        { color: colors.accent, fontSize: 13, fontFamily: typography.body },
  empty:         { padding: 32, alignItems: 'center' },
  emptyText:     { color: colors.text3, fontFamily: typography.body },
});
