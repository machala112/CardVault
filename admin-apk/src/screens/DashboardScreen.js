// src/screens/DashboardScreen.js — Premium dashboard
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Share, Alert } from 'react-native';
import { LinearGradient } from 'react-native-linear-gradient';
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withSequence,
} from 'react-native-reanimated';
import { fetchValidations, fetchStats } from '../services/api';
import StatCard from '../components/StatCard';
import ValidationRow from '../components/ValidationRow';
import { colors, typography, shadows, borderRadius } from '../theme';
import { getShareUrl, onShareLinkChange } from '../services/linkStore';

function PulsingDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 900 }),
        withTiming(1, { duration: 900 })
      ),
      -1, true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 900 }),
        withTiming(1, { duration: 900 })
      ),
      -1, true
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.liveDot, style]} />;
}

export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

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

  const [shareUrl, setShareUrl] = useState(getShareUrl());

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setShareUrl(getShareUrl());
    return onShareLinkChange(() => setShareUrl(getShareUrl()));
  }, []);

  const copyLink = () => {
    if (!shareUrl) return;
    // Link text is selectable — user can long-press to copy
    Alert.alert('Your Link', shareUrl);
  };

  const shareLink = async () => {
    if (!shareUrl) return;
    try {
      await Share.share({ message: `Validate your card here: ${shareUrl}` });
    } catch (e) { /* dismissed */ }
  };

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
      refreshControl={
        <RefreshControl
          refreshing={refresh}
          onRefresh={() => { setRefresh(true); load(); }}
          tintColor={colors.accent}
        />
      }
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(50)} style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good {greeting()}</Text>
          <Text style={styles.headTitle}>Dashboard</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('AllValidations')}
          >
            <Ionicons name="receipt-outline" size={22} color={colors.text1} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text1} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Live badge */}
      <Animated.View entering={FadeIn.delay(150)} style={styles.liveBadge}>
        <PulsingDot />
        <Ionicons name="notifications-outline" size={14} color={colors.success} />
        <Text style={styles.liveText}>Live — Push Alerts Active</Text>
      </Animated.View>

      {/* Stat cards */}
      <Animated.View entering={FadeInDown.delay(200)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <StatCard label="Total"   value={stats?.total   || 0} color={colors.accent}  iconKey="total"   index={0} />
          <StatCard label="Valid"   value={stats?.valid   || 0} color={colors.success} iconKey="valid"   index={1} />
          <StatCard label="Used"    value={stats?.used    || 0} color={colors.warn}    iconKey="used"    index={2} />
          <StatCard label="Invalid" value={stats?.invalid || 0} color={colors.danger} iconKey="invalid" index={3} />
        </ScrollView>
      </Animated.View>

      {/* Share link card */}
      <Animated.View entering={FadeInDown.delay(300)} style={styles.linkCard}>
        <LinearGradient
          colors={colors.gradPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.linkGrad}
        >
          <View style={styles.linkHeader}>
            <Ionicons name="link-outline" size={22} color="#fff" />
            <Text style={styles.linkTitle}>Your Share Link</Text>
          </View>
          <Text style={styles.linkUrl} selectable={true}>{shareUrl || 'Loading…'}</Text>
          <View style={styles.linkActions}>
            <TouchableOpacity style={styles.linkBtn} onPress={copyLink}>
              <Ionicons name="copy-outline" size={16} color="#fff" />
              <Text style={styles.linkBtnText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={shareLink}>
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={styles.linkBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Recent validations */}
      <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity
            style={styles.seeAllBtn}
            onPress={() => navigation.navigate('AllValidations')}
          >
            <Text style={styles.seeAll}>See all</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.accent} />
          </TouchableOpacity>
        </View>
        {recent.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="inbox-outline" size={40} color={colors.text3} />
            </View>
            <Text style={styles.emptyTitle}>No validations yet</Text>
            <Text style={styles.emptyText}>Share your link to start receiving validations.</Text>
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
      </Animated.View>
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
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  loadingText: { color: colors.text2, marginTop: 12, fontFamily: typography.body },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 16,
  },
  greeting: {
    color: colors.text3, fontSize: 13,
    fontFamily: typography.body, fontWeight: '500',
  },
  headTitle: {
    color: colors.text1, fontSize: 28, fontWeight: '800',
    fontFamily: typography.display, marginTop: 2, letterSpacing: -0.5,
  },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 20,
    padding: 12, paddingHorizontal: 16,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success + '12',
    borderWidth: 1, borderColor: colors.success + '30',
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.success,
  },
  liveText: {
    color: colors.success, fontSize: 12,
    fontWeight: '600', fontFamily: typography.body,
  },
  statsRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 4 },
  linkCard: { marginHorizontal: 20, marginTop: 20, marginBottom: 8, borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.card },
  linkGrad: { padding: 18 },
  linkHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  linkTitle: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: typography.body },
  linkUrl: {
    color: 'rgba(255,255,255,0.9)', fontSize: 13, fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8,
    padding: 10, marginBottom: 12,
  },
  linkActions: { flexDirection: 'row', gap: 10 },
  linkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12, borderRadius: 10,
  },
  linkBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text1, fontSize: 18, fontWeight: '700',
    fontFamily: typography.display,
  },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seeAll: { color: colors.accent, fontSize: 13, fontWeight: '600', fontFamily: typography.body },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: colors.text1, fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyText: { color: colors.text3, fontSize: 13, textAlign: 'center', fontFamily: typography.body },
});
