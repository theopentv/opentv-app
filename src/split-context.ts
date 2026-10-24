import { createContext } from 'react';

/**
 * LIST | DETAIL, drawn inside a tab (2.0.1).
 *
 * On a wide screen (the open iPhone Duo, an iPad) a tab shows its list in a
 * narrow column and the show, film or episode BESIDE it, both inside the same
 * tab screen. Not a route on top: a route on top owns the window's touches, so
 * the list beside it could never be tapped, and a cold-opened one crashed (see
 * design/iphone-duo/PLAN.md, Phase 4).
 *
 * Three contexts, kept in this file of their own so components/ui and
 * components/split can both read them without importing each other.
 */

/** The column a screen is drawn in, when it is not the whole window. */
export type Column = {
  /** Points to lay out in, insets already taken off. */
  width: number;
  /** Whether this column touches that edge of the window (and so owns its safe-area inset). */
  padLeft: boolean;
  padRight: boolean;
};
export const ColumnContext = createContext<Column | null>(null);

/** Set inside the detail pane: what the page reads instead of its route. */
export type Pane = {
  /** The route params the page would have had, parsed from its href. */
  params: Record<string, string>;
  /** Width of the pane's content, insets already taken off. */
  width: number;
  /** One level back in the pane; the pane closes after the last. */
  close: () => void;
  /** A page opened from inside the pane stacks on top of it. */
  open: (href: string) => void;
  /** The page re-keyed itself (a show whose TheTVDB id moved). */
  replace: (href: string) => void;
};
export const PaneContext = createContext<Pane | null>(null);
