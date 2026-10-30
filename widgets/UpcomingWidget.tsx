'use no memo'; // react-native-android-widget needs raw functions, as in UpNextWidget
/**
 * "Upcoming" home-screen widget (Android): the next episodes to air, soonest
 * first, with how far off each one is. The heading opens the Upcoming tab; a
 * row opens that episode. The task handler re-renders it on the widget's own
 * period, so the day count moves on without the app being opened.
 */
import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';

import type { WidgetPayload } from '../src/widget-sync';
import { t } from '../src/i18n';
import { dayWords, widgetLabels } from './labels';

type Props = { items: WidgetPayload['upcoming']; tall?: boolean };

const UPCOMING_TAB = 'opentv://shows?tab=upcoming';

function daysFromToday(air: string): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${air}T12:00:00`).getTime() - midnight.getTime()) / 86400000);
}

export function UpcomingWidget({ items, tall = false }: Props) {
  const L = widgetLabels();
  const words = dayWords();
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#121214',
        borderRadius: 16,
        padding: 12,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: UPCOMING_TAB }}>
      <TextWidget text={L.upcoming} style={{ fontSize: 12, color: '#F5C518', letterSpacing: 1.2, marginBottom: 6 }} />
      {items.length === 0 ? (
        <TextWidget text={L.nothingUpcoming} style={{ fontSize: 14, color: '#EDEDED', marginTop: 8 }} />
      ) : (
        items.slice(0, tall ? 6 : 3).map((e) => {
          const image = e.still ?? e.poster;
          const days = daysFromToday(e.air);
          return (
            <FlexWidget
              key={`${e.showId}-${e.season}-${e.episode}`}
              style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginTop: 7 }}
              clickAction="OPEN_URI"
              clickActionData={{ uri: `opentv://episode/${e.showId}-s${e.season}e${e.episode}` }}>
              {image?.startsWith('https:') ? (
                <ImageWidget image={image as `https:${string}`} imageWidth={52} imageHeight={34} radius={6} />
              ) : (
                <FlexWidget style={{ width: 52, height: 34, backgroundColor: '#2A2A2E', borderRadius: 6 }} />
              )}
              <FlexWidget style={{ flexDirection: 'column', marginLeft: 10, flex: 1 }}>
                <TextWidget
                  text={`${e.code}  ·  ${e.showName}`}
                  truncate="END"
                  maxLines={1}
                  style={{ fontSize: 13, color: '#FFFFFF' }}
                />
                <TextWidget
                  text={e.title ?? t('show.episodeFallbackTitle', { n: e.episode })}
                  truncate="END"
                  maxLines={1}
                  style={{ fontSize: 12, color: '#9A9AA0' }}
                />
              </FlexWidget>
              <TextWidget
                text={words[Math.max(days, 0)] ?? e.air}
                maxLines={1}
                style={{ fontSize: 12, color: '#F5C518', marginLeft: 8 }}
              />
            </FlexWidget>
          );
        })
      )}
    </FlexWidget>
  );
}
