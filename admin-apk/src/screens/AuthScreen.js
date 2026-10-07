// src/screens/AuthScreen.js — Premium sign in
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { signin, signup } from '../services/api';
import { colors, typography, shadows, borderRadius } from '../theme';

export default function AuthScreen({ onAuth }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPw, setShowPw] = useState(false);

  const handleAuth = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Enter your name.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fn = mode === 'signin' ? signin : signup;
      const data = await fn(email.trim(), password, name.trim());
      if (!data || !data.user) throw new Error('Unexpected response.');
      onAuth(data.user, data.link);
    } catch (e) {
      setError(e.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#0d0f1e', '#05060f']}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
        {/* Logo */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.logoWrap}>
          <LinearGradient colors={colors.gradPrimary} style={styles.logoGrad}>
            <Ionicons name="card-outline" size={44} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(200)} style={styles.title}>
          CardValidator
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(250)} style={styles.subtitle}>
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </Animated.Text>

        {/* Form card */}
        <Animated.View entering={FadeInDown.delay(350).springify()} style={[styles.card, shadows.card]}>
          {mode === 'signup' && (
            <>
              <Text style={styles.label}>Name</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color={colors.text3} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={colors.text3}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                />
              </View>
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={colors.text3} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.text3}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.text3} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="••••••••"
              placeholderTextColor={colors.text3}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleAuth}
            />
            <TouchableOpacity onPress={() => setShowPw(!showPw)} hitSlop={12}>
              <Ionicons
                name={showPw ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.text3}
              />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorWrap}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.buttonWrap}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={colors.gradPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonText}>
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchMode}
            onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
          >
            <Text style={styles.switchText}>
              {mode === 'signin'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoWrap: { marginBottom: 20 },
  logoGrad: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow(colors.accent),
  },
  title: {
    color: colors.text1,
    fontSize: 32,
    fontWeight: '800',
    fontFamily: typography.display,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.text2,
    fontSize: 15,
    fontFamily: typography.body,
    marginTop: 8,
    marginBottom: 32,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 24,
  },
  label: {
    color: colors.text2,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: typography.body,
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: colors.text1,
    fontFamily: typography.body,
    fontSize: 15,
  },
  errorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.danger + '15',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  error: { color: colors.danger, fontSize: 13, fontFamily: typography.body, flex: 1 },
  buttonWrap: { marginTop: 24, borderRadius: borderRadius.md, overflow: 'hidden' },
  button: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: typography.body },
  switchMode: { marginTop: 20, alignItems: 'center' },
  switchText: { color: colors.accent2, fontSize: 14, fontFamily: typography.body },
});
