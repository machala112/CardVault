// src/screens/ValidationDetailScreen.js
import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, Linking, Alert, Share, Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { colors, typography } from '../theme';

const STATUS_CONFIG = {
  valid:   { emoji: '✅', color: colors.success, label: 'Valid' },
  used:    { emoji: '⚠️', color: colors.warn,    label: 'Already Used' },
  invalid: { emoji: '❌', color: colors.danger,  label: 'Invalid' },
  pending: { emoji: '⏳', color: colors.text3,   label: 'Pending' },
};

export default function ValidationDetailScreen({ route, navigation }) {
  const insets     = useSafeAreaInsets();
  const { validation } = route.params;
  const cfg = STATUS_CONFIG[validation.status] || STATUS_CONFIG.pending;

  const downloadImage = async () => {
    if (!validation.image_url) {
      Alert.alert('No image', 'No image was uploaded for this validation.');
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow media access to save images to your phone.');
        return;
      }
      Alert.alert('Downloading…', 'Saving image to your gallery.');
      const fileName = `cardvalidator_${validation.id || Date.now()}.jpg`;
      const fileUri = FileSystem.documentDirectory + fileName;
      const { uri } = await FileSystem.downloadAsync(validation.image_url, fileUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved!', 'Image saved to your phone gallery.');
    } catch (err) {
      Alert.alert('Download failed', err.message || 'Could not save image.');
    }
  };

  const shareValidation = async () => {
    await Share.share({
      message: `CardValidator Result\nCode: ${validation.card_code}\nStatus: ${cfg.label}\nDate: ${format(new Date(validation.created_at), 'PPpp')}`,
    });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 100 }}
    >
      {/* Status banner */}
      <View style={[styles.banner, { borderColor: cfg.color + '44', backgroundColor: cfg.color + '15' }]}>
        <Text style={styles.bannerEmoji}>{cfg.emoji}</Text>
        <Text style={[styles.bannerLabel, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      {/* Code */}
      <View style={styles.card}>
        <InfoRow label="Card Code"    value={validation.card_code} mono />
        <InfoRow label="Status"       value={cfg.label} />
        <InfoRow label="Validated At" value={validation.validated_at ? format(new Date(validation.validated_at), 'PPpp') : 'N/A'} />
        <InfoRow label="Submitted At" value={format(new Date(validation.created_at), 'PPpp')} />
        <InfoRow label="IP Address"   value={validation.ip_address || 'Unknown'} />
        <InfoRow label="Record ID"    value={validation.id} mono small />
      </View>

      {/* Card image preview */}
      {validation.image_url ? (
        <View style={styles.imageSection}>
          <Text style={styles.sectionLabel}>Uploaded Card Image</Text>
          <View style={styles.imageCard}>
            {/* Image preview + download button side by side */}
            <View style={styles.imageRow}>
              <Image
                source={{ uri: validation.image_url }}
                style={styles.cardImage}
                resizeMode="contain"
              />
              {/* Download button beside the preview */}
              <View style={styles.imageActions}>
                <TouchableOpacity style={styles.downloadBtn} onPress={downloadImage}>
                  <Text style={styles.downloadIcon}>⬇</Text>
                  <Text style={styles.downloadText}>Save to{'\n'}Phone</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.noImageCard}>
          <Text style={styles.noImageText}>🖼 No image uploaded</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={shareValidation}>
          <Text style={styles.btnText}>📤 Share Result</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnBack]} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>← Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, mono, small }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.mono, small && styles.small]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.bg },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, padding: 16, borderRadius: 16, borderWidth: 1 },
  bannerEmoji:   { fontSize: 32 },
  bannerLabel:   { fontSize: 22, fontWeight: '700', fontFamily: typography.display },
  card:          { backgroundColor: colors.glass, borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden' },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 12 },
  infoLabel:     { color: colors.text3, fontSize: 12, fontFamily: typography.body, flex: 1 },
  infoValue:     { color: colors.text1, fontSize: 14, fontFamily: typography.body, flex: 2, textAlign: 'right' },
  mono:          { fontFamily: 'monospace', letterSpacing: 0.5 },
  small:         { fontSize: 11, color: colors.text2 },
  sectionLabel:  { color: colors.text3, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: 16, marginBottom: 8, fontFamily: typography.body },
  imageSection:  { marginBottom: 16 },
  imageCard:     { backgroundColor: colors.glass, borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder, marginHorizontal: 16, overflow: 'hidden', padding: 16 },
  imageRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardImage:     { flex: 1, height: 180, borderRadius: 10 },
  imageActions:  { justifyContent: 'center', alignItems: 'center' },
  downloadBtn:   { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center', minWidth: 72 },
  downloadIcon:  { fontSize: 22, marginBottom: 4 },
  downloadText:  { color: '#fff', fontWeight: '600', fontFamily: typography.body, fontSize: 11, textAlign: 'center' },
  noImageCard:   { backgroundColor: colors.glass, borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder, marginHorizontal: 16, padding: 32, alignItems: 'center', marginBottom: 16 },
  noImageText:   { color: colors.text3, fontFamily: typography.body },
  actions:       { flexDirection: 'row', gap: 10, marginHorizontal: 16 },
  btn:           { flex: 1, backgroundColor: colors.glass, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.glassBorder },
  btnBack:       { backgroundColor: 'rgba(124,109,250,0.12)', borderColor: 'rgba(124,109,250,0.3)' },
  btnText:       { color: colors.text1, fontWeight: '500', fontFamily: typography.body, fontSize: 14 },
});
