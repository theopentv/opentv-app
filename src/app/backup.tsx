/**
 * EVERY WAY TO KEEP A COPY, ON ONE SCREEN.
 *
 * Backup used to be FIVE THINGS IN THREE PLACES on the Data tab: a Google
 * Drive section, an iCloud section, a "Cloud backup" row, "Export my data" and
 * "Backup as JSON" — ten rows in all, three of them top-level sections. A
 * person whose whole question is "what happens if I lose my phone" had to
 * understand the difference between five features before they could answer it.
 *
 * They are not five features. They are one question with three answers, and
 * the answers differ in exactly one way — WHERE THE COPY GOES:
 *
 *   automatic   the platform's own drive, silently, while you sleep
 *   ours        a server, which is the only copy that crosses iPhone↔Android
 *   yourself    a file you hold, which nothing can revoke
 *
 * So the screen is organised by that, and nothing else. The ordering is
 * deliberate: the silent one first because it is the one that protects people
 * who never open this screen again.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch} from 'react-native';
import { Text } from '@/components/text';

import { backupNow, icloudAvailable, icloudSupported, lastBackupAt, lastBackupError } from '@/backup';
import { backupDestination } from '@/cloud-backup';
import {
  cloudSyncDevices,
  cloudSyncSupported,
  cloudSyncVia,
  lastCloudSyncAt,
  lastCloudSyncError,
  turnOffCloudSync,
  turnOnCloudSync,
  type Via,
} from '@/cloud-sync';
import { syncEnabled } from '@/device-sync';
import { exportAll } from '@/db';
import {
  connectDrive,
  disconnectDrive,
  driveBackupNow,
  driveConnected,
  driveSupported,
  lastDriveBackupAt,
  lastDriveError,
} from '@/gdrive-backup';
import { shareLibraryExport } from '@/manual-backup';
import { MenuRow, NavHeader, Screen } from '@/components/ui';
import { currentLocale, t } from '@/i18n';
import { colors, space, ls } from '@/theme';

/** Export as a TV Time-format ZIP (images bundled) — our importer reads it
 *  back losslessly. Shares via the Android-safe helper. */
async function exportData() {
  try {
    await shareLibraryExport();
  } catch (err) {
    Alert.alert(t('settings.data.exportFailedTitle'), err instanceof Error ? err.message : String(err));
  }
}

/** Full raw backup as JSON — belt and braces alongside the ZIP. */
async function exportJson() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const name = `opentv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.write(JSON.stringify(exportAll()));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: name });
    }
  } catch (err) {
    Alert.alert(t('settings.data.exportFailedTitle'), err instanceof Error ? err.message : String(err));
  }
}

function when(at: number | string | null): string {
  if (at == null) return t('settings.data.never');
  return new Date(at).toLocaleString(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export default function BackupScreen() {
  const [backedUp, setBackedUp] = useState(lastBackupAt());
  const [backupErr, setBackupErr] = useState(lastBackupError());
  const [driveOn, setDriveOn] = useState(() => driveConnected());
  const [driveAt, setDriveAt] = useState<number | null>(() => lastDriveBackupAt());
  const [driveBusy, setDriveBusy] = useState(false);
  const [cloud, setCloud] = useState(() => backupDestination());
  const [via, setVia] = useState<Via | null>(() => cloudSyncVia());
  const [viaBusy, setViaBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState(() => lastCloudSyncAt());
  const [syncErr, setSyncErr] = useState(() => lastCloudSyncError());
  const [serverSync, setServerSync] = useState(() => syncEnabled());

  /* Re-read on focus: the cloud screen is a push away and can change the
     destination, and a stale "Not set" here would be the screen disagreeing
     with the screen the person just came back from. */
  useFocusEffect(
    useCallback(() => {
      setBackedUp(lastBackupAt());
      setBackupErr(lastBackupError());
      setDriveOn(driveConnected());
      setDriveAt(lastDriveBackupAt());
      setCloud(backupDestination());
      setVia(cloudSyncVia());
      setSyncedAt(lastCloudSyncAt());
      setSyncErr(lastCloudSyncError());
      setServerSync(syncEnabled());
    }, []),
  );

  const driveBackUp = async () => {
    try {
      const r = await driveBackupNow(true);
      if (r === 'unavailable') {
        Alert.alert(t('settings.data.driveFailedTitle'), t('settings.data.driveFailedBody'));
        return;
      }
      setDriveAt(lastDriveBackupAt());
      Alert.alert(t('settings.data.backedUpTitle'), t('settings.data.driveBackedUpBody'));
    } catch (err) {
      Alert.alert(t('settings.data.backupFailedTitle'), err instanceof Error ? err.message : String(err));
    }
  };

  const toggleDrive = async (on: boolean) => {
    if (driveBusy) return;
    if (!on) {
      disconnectDrive();
      setDriveOn(false);
      return;
    }
    setDriveBusy(true);
    try {
      const r = await connectDrive();
      setDriveOn(r === 'ok');
      // Cancelling is an answer, not an error — somebody who backs out of the
      // account sheet does not need a dialog telling them so.
      if (r === 'ok') void driveBackUp();
      else if (r !== 'cancelled') {
        Alert.alert(
          t('settings.data.driveFailedTitle'),
          r === 'unauthorised'
            ? t('settings.data.driveUnauthorised')
            : r === 'no-play-services'
              ? t('settings.data.driveNoPlay')
              : `${t('settings.data.driveFailedBody')}${lastDriveError() ? `\n\n${lastDriveError()}` : ''}`,
        );
      }
    } finally {
      setDriveBusy(false);
    }
  };

  /* ONE CLOUD AT A TIME. Two folders would be two conversations, and a device
     on one never hears a device on the other, so choosing one turns the other
     off rather than offering a combination that cannot work. */
  const toggleVia = async (which: Via, on: boolean) => {
    if (viaBusy) return;
    if (!on) {
      turnOffCloudSync();
      setVia(null);
      return;
    }
    setViaBusy(true);
    try {
      const r = await turnOnCloudSync(which);
      setVia(cloudSyncVia());
      if (r === 'ok') {
        if (which === 'gdrive') setDriveOn(driveConnected());
      } else if (r === 'icloud-off') {
        Alert.alert(t('settings.data.icloudOffTitle'), t('settings.data.icloudOffBody'));
      } else if (r !== 'cancelled') {
        Alert.alert(
          t('settings.data.driveFailedTitle'),
          r === 'unauthorised'
            ? t('settings.data.driveUnauthorised')
            : r === 'no-play-services'
              ? t('settings.data.driveNoPlay')
              : `${t('settings.data.driveFailedBody')}${lastDriveError() ? `\n\n${lastDriveError()}` : ''}`,
        );
      }
    } finally {
      setViaBusy(false);
    }
  };

  const others = via ? cloudSyncDevices() : [];

  const backUp = async () => {
    try {
      const r = await backupNow(true);
      if (r === 'unavailable') {
        Alert.alert(t('settings.data.icloudOffTitle'), t('settings.data.icloudOffBody'));
        return;
      }
      setBackedUp(lastBackupAt());
      setBackupErr(null);
      Alert.alert(t('settings.data.backedUpTitle'), t('settings.data.backedUpBody'));
    } catch (err) {
      setBackupErr(lastBackupError());
      Alert.alert(t('settings.data.backupFailedTitle'), err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Screen>
      <NavHeader title={t('settings.backup.title')} close />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <Text style={s.intro}>{t('settings.backup.intro')}</Text>

        {/* ── the silent one ───────────────────────────────────────────── */}
        <Text accessibilityRole="header" style={s.section}>{t('settings.backup.automaticSection')}</Text>

        {icloudSupported() && (
          <>
            <MenuRow
              trackId="settings.data.icloudDrive"
              title={t('settings.data.icloudDrive')}
              sub={t('settings.data.icloudDriveSub')}
              value={icloudAvailable() ? t('common.on') : t('common.off')}
            />
            <MenuRow trackId="settings.data.lastBackedUp" title={t('settings.data.lastBackedUp')} value={when(backedUp)} />
            {/* SAID STANDING STILL. The automatic backup swallows its own
                error, so a full iCloud used to show only as a date that
                stopped moving — months of believing you had a copy. */}
            {backupErr && (
              <MenuRow
                trackId="settings.data.backupFailed"
                title={t('settings.data.backupFailedTitle')}
                sub={`${t('settings.data.backupFailedSub')}\n\n${backupErr}`}
                danger
              />
            )}
            <MenuRow
              trackId="settings.data.backupNow"
              title={t('settings.data.backupNow')}
              sub={t('settings.data.backupNowSub')}
              onPress={() => void backUp()}
            />
          </>
        )}

        {driveSupported() && (
          <>
            <MenuRow
              trackId="settings.data.driveBackup"
              title={t('settings.data.driveBackup')}
              sub={t('settings.data.driveBackupSub')}
              right={
                <Switch
                  value={driveOn}
                  disabled={driveBusy}
                  onValueChange={(v) => void toggleDrive(v)}
                  trackColor={{ true: colors.green }}
                />
              }
            />
            {driveOn && (
              <>
                <MenuRow trackId="settings.data.driveLastBackedUp" title={t('settings.data.lastBackedUp')} value={when(driveAt)} />
                <MenuRow
                  trackId="settings.data.driveBackupNow"
                  title={t('settings.data.backupNow')}
                  sub={t('settings.data.driveBackupNowSub')}
                  onPress={() => void driveBackUp()}
                />
              </>
            )}
          </>
        )}

        {/* ── sync through their own cloud, free (2.0.0) ─────────────────── */}
        {(cloudSyncSupported('icloud') || cloudSyncSupported('gdrive')) && (
          <>
            <Text accessibilityRole="header" style={s.section}>{t('cloudSync.section')}</Text>
            <Text style={s.note}>{serverSync ? t('cloudSync.serverWins') : t('cloudSync.intro')}</Text>
            {cloudSyncSupported('icloud') && (
              <MenuRow
                trackId="cloudSync.icloud"
                title={t('cloudSync.icloud')}
                sub={t('cloudSync.icloudSub')}
                right={
                  <Switch
                    value={via === 'icloud'}
                    disabled={viaBusy}
                    onValueChange={(v) => void toggleVia('icloud', v)}
                    trackColor={{ true: colors.green }}
                  />
                }
              />
            )}
            {cloudSyncSupported('gdrive') && (
              <MenuRow
                trackId="cloudSync.drive"
                title={t('cloudSync.drive')}
                sub={t('cloudSync.driveSub')}
                right={
                  <Switch
                    value={via === 'gdrive'}
                    disabled={viaBusy}
                    onValueChange={(v) => void toggleVia('gdrive', v)}
                    trackColor={{ true: colors.green }}
                  />
                }
              />
            )}
            {via && !serverSync && (
              <>
                <MenuRow trackId="cloudSync.lastSynced" title={t('cloudSync.lastSynced')} value={when(syncedAt)} />
                {others.length > 0 && (
                  <MenuRow
                    trackId="cloudSync.otherDevices"
                    title={t('cloudSync.otherDevices')}
                    sub={others.map((d) => d.name ?? d.platform ?? d.dev).join(', ')}
                  />
                )}
                {syncErr && (
                  <MenuRow trackId="cloudSync.failing" title={t('cloudSync.failing')} sub={syncErr} danger />
                )}
              </>
            )}
          </>
        )}

        {/* ── the one that crosses ─────────────────────────────────────── */}
        <Text accessibilityRole="header" style={s.section}>{t('settings.backup.cloudSection')}</Text>
        <MenuRow
          trackId="cloudBackup.title"
          title={t('cloudBackup.title')}
          sub={t('cloudBackup.entrySub')}
          value={cloud == null ? t('common.off') : t('common.on')}
          onPress={() => router.push('/cloud-backup')}
        />

        {/* ── the one nobody can revoke ────────────────────────────────── */}
        <Text accessibilityRole="header" style={s.section}>{t('settings.backup.yourselfSection')}</Text>
        <MenuRow
          trackId="settings.data.export"
          title={t('settings.data.export')}
          sub={t('settings.data.exportSub')}
          onPress={() => void exportData()}
        />
        <MenuRow
          trackId="settings.data.backupJson"
          title={t('settings.data.backupJson')}
          sub={t('settings.data.backupJsonSub')}
          onPress={() => void exportJson()}
        />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  intro: {
    color: colors.dim,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  note: {
    color: colors.dim,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  section: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: ls(0.8),
    textTransform: 'uppercase',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
});
