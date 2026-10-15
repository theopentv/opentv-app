import { Children, cloneElement, isValidElement, type ReactElement } from 'react';
import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { currentLocale } from '@/i18n';

/**
 * React Native's `Text`, except that `textTransform: 'uppercase'` follows the
 * APP's language (15 Oct). iOS upper-cases with no locale at all and Android
 * with the PHONE's, so Turkish read "SIRADAKI" — dotless I, a different letter
 * — where Turkish writes "SIRADAKİ". Every file that sets an uppercase style
 * imports `Text` from here instead of from react-native, and its string
 * children are upper-cased with `toLocaleUpperCase(currentLocale())` before
 * they reach the native side; the native transform is then switched off.
 *
 * Names that come from DATA (show titles, characters, providers) must stay on
 * the English rule — "TWİN PEAKS" was the bug the other way. Upper-case those
 * with plain `toUpperCase()` where they are rendered: an already upper-case
 * string is left alone here, so the two never fight.
 *
 * A nested `Text` inherits uppercase natively, and with the native transform
 * off it would inherit nothing: nested ones from this module are handed the
 * uppercase style first, so their own `textTransform` (e.g. 'none') still wins.
 */
export function Text(props: TextProps) {
  'use no memo'; // reads the active locale at render; the compiler must not cache it
  const flat = StyleSheet.flatten(props.style) as TextStyle | undefined;
  if (flat?.textTransform !== 'uppercase') return <RNText {...props} />;
  const locale = currentLocale();
  const children = Children.map(props.children, (c) => {
    if (typeof c === 'string') return c.toLocaleUpperCase(locale);
    if (isValidElement(c) && c.type === Text) {
      const el = c as ReactElement<TextProps>;
      return cloneElement(el, { style: [UPPER, el.props.style] });
    }
    return c;
  });
  return (
    <RNText {...props} style={[props.style, NONE]}>
      {children}
    </RNText>
  );
}

const UPPER: TextStyle = { textTransform: 'uppercase' };
const NONE: TextStyle = { textTransform: 'none' };
