export interface RelationCount { trips: number; occurrences: number; }
export interface DiscoveryCoverage {
  direct: RelationCount;
  shared: RelationCount;
  anchor: RelationCount;
  discoverable: RelationCount;
  missing: RelationCount;
  withheld: RelationCount;
}

type SourceCategory = Exclude<keyof DiscoveryCoverage, 'discoverable'>;

/** Count each document relation once; trips can span more than one source category. */
export function countDiscoveryCoverage() {
  const categories = ['direct', 'shared', 'anchor', 'discoverable', 'missing', 'withheld'] as const;
  const counts = new Map(categories.map(category => [category, { trips: new Set<string>(), occurrences: 0 }]));

  function record(category: keyof DiscoveryCoverage, tripId: string) {
    const group = counts.get(category)!;
    group.trips.add(tripId);
    group.occurrences++;
  }

  return {
    add(category: SourceCategory, tripId: string) {
      record(category, tripId);
      if (category === 'direct' || category === 'shared' || category === 'anchor') record('discoverable', tripId);
    },
    totals(): DiscoveryCoverage {
      const total = {} as DiscoveryCoverage;
      for (const [category, group] of counts) {
        total[category] = { trips: group.trips.size, occurrences: group.occurrences };
      }
      return total;
    },
  };
}
