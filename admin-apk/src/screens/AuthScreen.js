// src/screens/AuthScreen.js — Admin sign in
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signin } from '../services/api';
import { colors, typography } from '../theme';

export default function AuthScreen({ onAuth }) {
  const insets   = useSafeAreaInsets();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await signin(email.trim(), password);
      if (!data || !data.user) {
        throw new Error('Unexpected sign-in response.');
      }
      onAuth(data.user);
    } catch (e) {
      setError(e.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.emoji}>🔐</Text>
        <Text style={styles.title}>Admin Sign In</Text>
        <Text style={styles.subtitle}>CardValidator Admin</Text>

        <Text style={styles.label}>Email</Text>
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

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.text3}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleSignIn}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:     { width: '100%', maxWidth: 380, backgroundColor: colors.glass, borderRadius: 20, borderWidth: 1, borderColor: colors.glassBorder, padding: 28 },
  emoji:    { fontSize: 40, textAlign: 'center', marginBottom: 12 },
  title:    { color: colors.text1, fontSize: 24, fontWeight: '700', fontFamily: typography.display, textAlign: 'center' },
  subtitle: { color: colors.text3, fontSize: 13, fontFamily: typography.body, textAlign: 'center', marginTop: 4, marginBottom: 24 },
  label:    { color: colors.text2, fontSize: 12, fontFamily: typography.body, marginBottom: 6, marginTop: 12 },
  input:    { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 12, paddingHorizontal: 14, height: 48, color: colors.text1, fontFamily: typography.body, fontSize: 15 },
  error:    { color: colors.danger, fontSize: 13, fontFamily: typography.body, marginTop: 12, textAlign: 'center' },
  button:   { backgroundColor: colors.accent, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: typography.body },
});
