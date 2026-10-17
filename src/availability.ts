/**
 * "Tell me when it's on my services" (2.0.0, PLUS) — the asking and the
 * remembering. The rules are in `availability-plan.ts`, tested.
 *
 * ON THE PHONE ONLY. No server knows which services anybody pays for or what
 * is on their watchlist: the phone asks TMDB directly, the same way the film
 * page already does for its "where to watch", and keeps what it saw in its own
 * database. Somebody who never joined the community still never contacts ours.
 *
 * THE BUDGET. At most one run every eight hours, and only on a launch or a
 * return to the app; at most `CHECK_CAP` (40) titles a run; no title asked
 * about twice in a day. So a phone makes at most 120 TMDB requests a day for
 * this however big the watchlist, and a 400-title watchlist is walked round
 * every few days. A watchlist of 30 costs 30 a day.
 *
 * WHAT IS CHECKED: films on the watchlist and followed shows not yet started —
 * the two lists of things somebody means to watch and has not. A show already
 * under way is being watched somewhere already.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  includedServices,
  newlyOnMyServices,
  parseNames,
  pickTitlesToCheck,
  regionCatalogue,
} from '@/availability-plan';
import db, { getMeta, setMeta } from '@/db';
import { t } from '@/i18n';
import { showMeta } from '@/metadata';
import { isPlus } from '@/plus';
import { shouldResync, watchOptions, type WatchKind } from '@/pure';
import { watchRegion } from '@/show-meta-fetch';
import { pool, tmdb } from '@/tmdb';

const SERVICES_KEY = 'myServices';
const ALERTS_KEY = 'availabilityAlerts';
const RUN_KEY = 'availabilityRunAt';
const RUN_GAP_MS = 8 * 3600000;

/** The services the user picked, display names as TMDB spells them. */
export function myServices(): string[] {
  return parseNames(getMeta(SERVICES_KEY));
}

export function setMyServices(list: readonly string[]): void {
  setMeta(SERVICES_KEY, JSON.stringify([...new Set(list)]));
}

/** On unless switched off: somebody who picked their services did it to hear. */
export function availabilityAlertsOn(): boolean {
  return getMeta(ALERTS_KEY) !== '';
}

/** Turning it on asks for notification permission; returns whether it is on. */
export async function setAvailabilityAlerts(on: boolean): Promise<boolean> {
  if (on) {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      // said no: the switch reads off, rather than on and silently doing nothing
      setMeta(ALERTS_KEY, '');
      return false;
    }
  }
  setMeta(ALERTS_KEY, on ? '1' : '');
  return on;
}

/*
 * ITS OWN TABLE, created here rather than in `db.ts`, because nothing else
 * reads it and one row per title is the shape of the data: what this phone
 * last saw, for which country, and which services it has already announced.
 */
let tableReady = false;
function ensureTable(): void {
  if (tableReady) return;
  db.execSync(`CREATE TABLE IF NOT EXISTS availability_seen (
    kind TEXT NOT NULL,
    tmdbId INTEGER NOT NULL,
    region TEXT NOT NULL,
    providers TEXT NOT NULL,
    notified TEXT NOT NULL DEFAULT '[]',
    checkedAt INTEGER NOT NULL,
    PRIMARY KEY (kind, tmdbId)
  )`);
  tableReady = true;
}

type Row = { kind: 'movie' | 'show'; tmdbId: number; region: string; providers: string; notified: string; checkedAt: number };

function rows(): Map<string, Row> {
  ensureTable();
  const all = db.getAllSync<Row>('SELECT kind, tmdbId, region, providers, notified, checkedAt FROM availability_seen');
  return new Map(all.map((r) => [`${r.kind}:${r.tmdbId}`, r]));
}

/**
 * What was last seen per title, for THIS region only — the filter's source
 * for films, whose bundled metadata is one American snapshot. Keyed
 * `movie:<tmdbId>` / `show:<tmdbId>`.
 */
export function servicesSeen(): Map<string, string[]> {
  const region = watchRegion();
  const out = new Map<string, string[]>();
  try {
    for (const [k, r] of rows()) if (r.region === region) out.set(k, parseNames(r.providers));
  } catch {
    // a filter must never break the grid
  }
  return out;
}

type Candidate = { kind: 'movie' | 'show'; tmdbId: number; title: string; path: string; checkedAt: number | null };

function candidates(seen: Map<string, Row>, region: string): Candidate[] {
  const out: Candidate[] = [];
  const films = db.getAllSync<{ name: string; tmdbId: number }>(
    'SELECT name, tmdbId FROM movies WHERE watchedAt IS NULL AND tmdbId IS NOT NULL',
  );
  for (const f of films) out.push({ kind: 'movie', tmdbId: f.tmdbId, title: f.name, path: `/movie/${encodeURIComponent(f.name)}`, checkedAt: null });
  const shows = db.getAllSync<{ tvdbId: number; name: string; tmdbId: number | null }>(
    `SELECT s.tvdbId, s.name, s.tmdbId FROM shows s
     WHERE s.followed = 1 AND s.archived = 0 AND s.episodesSeen = 0
       AND NOT EXISTS (SELECT 1 FROM watches w WHERE w.showId = s.tvdbId)`,
  );
  for (const s of shows) {
    const tmdbId = s.tmdbId ?? showMeta(s.tvdbId)?.tmdbId ?? null;
    if (tmdbId) out.push({ kind: 'show', tmdbId, title: s.name, path: `/show/${s.tvdbId}`, checkedAt: null });
  }
  for (const c of out) {
    const r = seen.get(`${c.kind}:${c.tmdbId}`);
    // checked for another country is not checked: it goes to the front
    c.checkedAt = r && r.region === region ? r.checkedAt : null;
  }
  return out;
}

type ProvidersReply = { results?: Record<string, Partial<Record<WatchKind, { provider_name?: string; logo_path?: string | null }[]>>> };

let running: Promise<void> | null = null;

/**
 * One run: pick the titles due, ask TMDB, remember, announce what is new.
 * Quiet on every failure — a title that failed keeps its old row and is
 * simply due again next run.
 */
export function checkAvailability(force = false): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const mine = myServices();
      if (!isPlus() || mine.length === 0) return;
      const now = Date.now();
      if (!force && !shouldResync(Number(getMeta(RUN_KEY)), now, RUN_GAP_MS)) return;
      // stamped FIRST: a run that dies halfway must not be retried on every
      // return to the app for the rest of the day
      setMeta(RUN_KEY, String(now));

      const region = watchRegion();
      const seen = rows();
      const due = pickTitlesToCheck(candidates(seen, region), now);
      if (!due.length) return;

      const alerts = availabilityAlertsOn() && (await Notifications.getPermissionsAsync()).granted;
      /*
       * SHOWN WHILE THE APP IS OPEN, and only these. This runs on a launch or a
       * return to the app, so the phone is in somebody's hand — and with no
       * handler at all (the app had none) iOS drops a foreground notification
       * on the floor. Every other kind keeps exactly that behaviour.
       */
      if (alerts) {
        Notifications.setNotificationHandler({
          handleNotification: async (n) => {
            const show = (n.request.content.data as { kind?: string } | undefined)?.kind === 'available';
            return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
          },
        });
      }
      if (alerts && Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('availability', {
          name: t('myServices.channel'),
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      // Four at a time: these are tiny replies, and this is background work
      // that must not crowd the requests the screen in front of them makes.
      await pool(
        due,
        async (c) => {
          const d = await tmdb<ProvidersReply>(`/${c.kind === 'movie' ? 'movie' : 'tv'}/${c.tmdbId}/watch/providers`);
          const current = includedServices(watchOptions(d.results?.[region]));
          const old = seen.get(`${c.kind}:${c.tmdbId}`);
          const prev = old && old.region === region ? parseNames(old.providers) : null;
          const notified = parseNames(old?.notified);
          const arrived = newlyOnMyServices(prev, current, mine, notified);
          let told = notified;
          if (arrived.length && alerts) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t('myServices.arrivedTitle', { service: arrived[0]! }),
                body: t('myServices.arrivedBody', { title: c.title, service: arrived.join(', ') }),
                data: { kind: 'available', path: c.path },
                ...(Platform.OS === 'android' ? { channelId: 'availability' } : {}),
              },
              trigger: null,
            });
            told = [...notified, ...arrived];
          }
          db.runSync(
            `INSERT OR REPLACE INTO availability_seen (kind, tmdbId, region, providers, notified, checkedAt) VALUES (?, ?, ?, ?, ?, ?)`,
            [c.kind, c.tmdbId, region, JSON.stringify(current), JSON.stringify(told), now],
          );
        },
        4,
      );
    } catch {
      // background work never breaks the app
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Every service TMDB lists for the user's country, best-known first — what
 * the picker offers. Two small requests, only when the picker opens. Offline,
 * the services this phone has already seen on the user's own titles.
 */
export async function serviceChoices(): Promise<string[]> {
  const region = watchRegion();
  type Catalogue = { results?: { provider_name?: string; display_priorities?: Record<string, number>; display_priority?: number }[] };
  try {
    const [films, tv] = await Promise.all([
      tmdb<Catalogue>(`/watch/providers/movie?watch_region=${region}`),
      tmdb<Catalogue>(`/watch/providers/tv?watch_region=${region}`),
    ]);
    const list = regionCatalogue([films.results ?? [], tv.results ?? []], region);
    if (list.length) return list;
  } catch {
    // fall through to what the phone already knows
  }
  const known = new Set<string>();
  for (const names of servicesSeen().values()) for (const n of names) known.add(n);
  return [...known].sort((a, b) => a.localeCompare(b));
}
