/**
 * "Which month, which year?" — the one door into Wrapped.
 *
 * Three screens open it (Profile, Deep Stats, and Wrapped's own quiet state),
 * so it is one component: three copies of a list of periods is three chances
 * for them to disagree about which months exist.
 *
 * The current month is never offered — see `periodOptions`. A recap of a month
 * still running is a recap of nothing.
 */
import { useState } from 'react';

import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { currentLocale, t } from '@/i18n';
import { formatPeriod } from '@/locale-resolve';
import { periodOptions, wrappedSoFar } from '@/pure';
import { todayISO } from '@/components/heatmap';
import { watchYears } from '@/stats-calc';

/** 'July 2026' for a month, '2025' for a year, in the app's language, and
 *  '2026 so far' for a year `today` is still inside (2.0.3). */
export function periodLabel(key: string, today?: string): string {
  if (today != null && wrappedSoFar(key, today)) return t('wrappedFinal.soFar', { year: key });
  return formatPeriod(key, currentLocale());
}

export function PeriodSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (key: string) => void;
}) {
  // In an initialiser, not in render: `watchYears()` is a database read, and
  // the React Compiler would memoise a render-time one against its (empty)
  // arguments. Which years have watches in them changes about once a year.
  // The LOCAL day (2.0.3): a UTC one kept the year off the list for the first
  // hours of 1 December east of Greenwich, while the Profile card, which reads
  // the local day, was already offering it.
  const [today] = useState(todayISO);
  const [options] = useState(() => periodOptions(today, watchYears()));

  const actions: SheetAction[] = options.map((key) => ({
    text: periodLabel(key, today),
    icon: key.length === 4 ? 'calendar-outline' : 'calendar-clear-outline',
    onPress: () => onPick(key),
  }));

  return <ActionSheet visible={visible} title={t('plus.wrapped.pickTitle')} actions={actions} onClose={onClose} />;
}
