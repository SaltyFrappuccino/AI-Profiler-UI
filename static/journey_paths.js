(function initJourneyPaths(global) {
  const TIER_RANK = Object.freeze({ confirmed: 0, proven: 1, inferred: 2, candidate: 3 });

  function findServicePaths(calls, from, to, { maxLen = 10, maxPaths = 40 } = {}) {
    const bySource = new Map();
    for (const call of calls) {
      if (!bySource.has(call.sourceService)) bySource.set(call.sourceService, []);
      bySource.get(call.sourceService).push(call);
    }
    for (const list of bySource.values()) {
      list.sort((a, b) =>
        (TIER_RANK[a.tier] ?? 4) - (TIER_RANK[b.tier] ?? 4)
        || String(a.targetService || "").localeCompare(String(b.targetService || ""))
      );
    }
    const paths = [];
    const walk = (node, trail, seen) => {
      if (paths.length >= maxPaths || trail.length >= maxLen) return;
      for (const call of bySource.get(node) || []) {
        if (seen.has(call.targetService)) continue;
        const next = [...trail, call];
        if (call.targetService === to) {
          paths.push(next);
          if (paths.length >= maxPaths) return;
          continue;
        }
        seen.add(call.targetService);
        walk(call.targetService, next, seen);
        seen.delete(call.targetService);
      }
    };
    walk(from, [], new Set([from]));
    const preference = (path) => [
      Math.max(...path.map((call) => TIER_RANK[call.tier] ?? 4)),
      path.length,
    ];
    paths.sort((left, right) => {
      const leftScore = preference(left);
      const rightScore = preference(right);
      return leftScore[0] - rightScore[0] || leftScore[1] - rightScore[1];
    });
    return paths;
  }

  function pathParticipants(calls) {
    const seen = new Map();
    for (const call of calls) {
      if (!seen.has(call.sourceService)) seen.set(call.sourceService, call.sourceLabel);
      if (!seen.has(call.targetService)) seen.set(call.targetService, call.targetLabel);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "ru"));
  }

  global.AIProfilerJourneyPaths = { TIER_RANK, findServicePaths, pathParticipants };
})(globalThis);
