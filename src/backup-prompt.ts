/**
 * ASK ABOUT BACKUP ONCE THERE IS SOMETHING TO BACK UP (8 Oct).
 *
 * The welcome screen used to stop everybody whose iCloud (or Google Drive) was
 * off with a full-screen "turn it on" before they had chosen to import or
 * start — asking them to protect a library that did not exist yet. Asking
 * before the value is shown is the textbook way to get a "no", or a closed
 * app. So Get Started goes straight to the choices, and this asks once, on the
 * tabs, when there is a library: "N episodes, only on this phone".
 *
 * Once ever. An iPhone with iCloud already on needs nothing — its backup is
 * automatic — so it is marked done without a word.
 */
import { Alert, Linking, Platform } from 'react-native';

import { icloudAvailableAsync, icloudSupported } from '@/backup';
import db, { getMeta, hasLibrary, setMeta } from '@/db';
import { t } from '@/i18n';

const ASKED = 'backupPromptAsked';

function episodes(): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM watches')?.n ?? 0;
}

/** OpenTV Backup or the user's own server already holds a copy (21 Oct): it
 *  was asking "keep your library safe" right after "OpenTV Backup is on". */
function copiedElsewhere(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { backupDestination } = require('@/cloud-backup') as typeof import('@/cloud-backup');
  return backupDestination() != null;
}

export async function offerBackupIfDue(): Promise<boolean> {
  if (getMeta(ASKED) === '1' || !hasLibrary()) return false;
  if (copiedElsewhere()) {
    setMeta(ASKED, '1');
    return false;
  }
  const count = episodes();
  // NOTHING WATCHED YET, NOTHING TO PROTECT (8 Oct): a library of added shows
  // and no episodes was told "your 0 episodes are only on this phone". The ask
  // waits — unstamped — for the first episode.
  if (count === 0) return false;

  if (Platform.OS === 'ios') {
    if (!icloudSupported()) return false;
    // Re-asked after the await: Plus can switch OpenTV Backup on meanwhile.
    if ((await icloudAvailableAsync().catch(() => true)) || copiedElsewhere()) {
      setMeta(ASKED, '1');
      return false;
    }
    setMeta(ASKED, '1');
    Alert.alert(t('backupPrompt.title'), t('backupPrompt.icloudBody', { count }), [
      { text: t('backupPrompt.later'), style: 'cancel' },
      { text: t('backupPrompt.openSettings'), onPress: () => void Linking.openSettings() },
    ]);
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const drive = require('@/gdrive-backup') as typeof import('@/gdrive-backup');
  if (!drive.driveSupported() || drive.driveConnected()) {
    setMeta(ASKED, '1');
    return false;
  }
  setMeta(ASKED, '1');
  Alert.alert(t('backupPrompt.title'), t('backupPrompt.driveBody', { count }), [
    { text: t('backupPrompt.later'), style: 'cancel' },
    {
      text: t('backupPrompt.turnOnDrive'),
      onPress: () =>
        void drive.connectDrive().then((r) => {
          if (r !== 'ok' && r !== 'cancelled') Alert.alert(t('settings.data.driveFailedTitle'), t('settings.data.driveFailedBody'));
        }),
    },
  ]);
  return true;
}
