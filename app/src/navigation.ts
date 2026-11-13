// Only the opaque entry ID goes into browser history. Place results and return
// actions belong to the current app instance and expire on reload.
export interface Visit {
  id: string;
  hash: string;
  parent?: Visit;
  restorePage?: () => void;
  restorePlace?: () => void;
  restoreViewport?: () => void;
  placeStep?: 'form' | 'results' | 'selected';
}

export function createVisits() {
  const make = (parent?: Visit): Visit => ({ id: crypto.randomUUID(), hash: location.hash, parent });
  let current = make();
  const visits = new Map([[current.id, current]]);
  function mark() {
    history.replaceState({ ...history.state, dorimVisit: current.id }, '');
  }
  return {
    get current() { return current; },
    mark,
    enter() {
      const known = visits.get(history.state?.dorimVisit);
      if (known === current) return null;
      // A visit left over from a previous document has no usable local parent.
      current = known ?? make(history.state?.dorimVisit ? undefined : current);
      if (!known) {
        visits.set(current.id, current);
        mark();
      }
      return { visit: current, restored: !!known };
    },
    pushStep(hash = location.hash) {
      const parent = current;
      current = make(parent);
      current.hash = hash;
      current.restorePage = parent.restorePage;
      visits.set(current.id, current);
      history.pushState({ ...history.state, dorimVisit: current.id }, '', hash || location.href);
      return current;
    },
    reset() {
      visits.clear();
      current = make();
      visits.set(current.id, current);
      mark();
    },
    backTo(matches: (visit: Visit) => boolean) {
      let steps = 1;
      for (let visit = current.parent; visit; visit = visit.parent, steps++) {
        if (matches(visit)) {
          history.go(-steps);
          return true;
        }
      }
      return false;
    },
  };
}
