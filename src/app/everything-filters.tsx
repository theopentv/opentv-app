import { FiltersSheet } from '@/components/filters-sheet';

/** The Everything I watch filter sheet: the Shows and Movies sheet with a
 *  Type axis on top, so the three library pages filter the same way. */
export default function EverythingFiltersRoute() {
  return <FiltersSheet kind="everything" />;
}
