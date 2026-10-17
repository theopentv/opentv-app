/**
 * My streaming services (2.0.0, PLUS) — pick the ones you pay for, then hear
 * when a watchlist title arrives on one, and filter the library to them.
 *
 * The list is TMDB's for the user's own country (Settings → Where to watch),
 * fetched when this opens; offline, the services already seen on the user's
 * own titles. Nothing about the choice leaves the phone. See `availability.ts`
 * for what the background check costs.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  availabilityAlertsOn,
  checkAvailability,
  myServices,
  serviceChoices,
  setAvailabilityAlerts,
  setMyServices,
} from '@/availability';
import { serviceKey } from '@/availability-plan';
import { MenuRow, NavHeader, Screen } from '@/components/ui';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { usePlus } from '@/plus';
import { colors, space } from '@/theme';

export default function MyServicesScreen() {
  const plus = usePlus();
  const [picked, setPicked] = useState<string[]>(() => myServices());
  const [choices, setChoices] = useState<string[] | null>(null);
  const [alerts, setAlerts] = useState(() => availabilityAlertsOn());

  useEffect(() => {
    let live = true;
    void serviceChoices().then((list) => live && setChoices(list));
    return () => {
      live = false;
    };
  }, []);

  // what is picked always shows, even when today's catalogue no longer lists it
  const rows = useMemo(() => {
    const list = choices ?? [];
    const listed = new Set(list.map(serviceKey));
    return [...picked.filter((p) => !listed.has(serviceKey(p))), ...list];
  }, [choices, picked]);
  const pickedKeys = useMemo(() => new Set(picked.map(serviceKey)), [picked]);

  const toggle = (name: string) => {
    tapLight();
    const key = serviceKey(name);
    const next = pickedKeys.has(key) ? picked.filter((p) => serviceKey(p) !== key) : [...picked, name];
    setPicked(next);
    setMyServices(next);
    // The first pick is the moment the alerts start to mean something, so it
    // is the moment to ask for permission — never on opening the screen.
    if (picked.length === 0 && next.length > 0 && alerts) void setAvailabilityAlerts(true).then(setAlerts);
  };

  // Leaving is when the choice is final; the first check (a baseline, which
  // announces nothing) starts then rather than on every tap.
  useEffect(() => () => void checkAvailability(true), []);

  const header = (
    <>
      {!plus && (
        <MenuRow trackId="myServices.lapsed" title={t('myServices.lapsedTitle')} sub={t('myServices.lapsedBody')} onPress={() => router.push('/paywall')} />
      )}
      <Text style={styles.intro}>{t('myServices.intro')}</Text>
      <MenuRow
        trackId="myServices.alerts"
        title={t('myServices.alerts')}
        sub={t('myServices.alertsSub')}
        right={
          <Switch
            value={alerts}
            onValueChange={(v) => {
              setAlerts(v);
              void setAvailabilityAlerts(v).then((ok) => {
                setAlerts(ok);
                if (v && !ok) Alert.alert(t('settings.app.notificationsOffTitle'), t('settings.app.notificationsOffBody'));
              });
            }}
            trackColor={{ true: colors.green }}
          />
        }
      />
      <Text accessibilityRole="header" style={styles.section}>{t('myServices.pickTitle', { count: picked.length })}</Text>
      {choices == null && <ActivityIndicator style={{ marginVertical: space.lg }} color={colors.dim} />}
      {choices != null && rows.length === 0 && <Text style={styles.intro}>{t('myServices.none')}</Text>}
    </>
  );

  return (
    <Screen>
      <NavHeader title={t('myServices.title')} />
      <FlatList
        data={rows}
        keyExtractor={(name) => serviceKey(name)}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => {
          const on = pickedKeys.has(serviceKey(item));
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={item}
              style={styles.row}
              onPress={() => toggle(item)}>
              <Text style={styles.name} numberOfLines={1}>{item}</Text>
              <View style={[styles.tick, on && styles.tickOn]}>
                {on && <Ionicons name="checkmark" size={15} color="#FFF" />}
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.dim, fontSize: 13.5, lineHeight: 19, paddingHorizontal: space.lg, paddingVertical: space.md },
  section: { color: colors.text, fontSize: 15, fontWeight: '800', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  name: { flex: 1, color: colors.text, fontSize: 15.5 },
  tick: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.checkIdle, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.green },
});
