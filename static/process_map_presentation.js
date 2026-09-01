(function initProcessMapPresentation(global) {
  const FLOW_FILTERS = new Set(["all", "main", "conditional", "async", "exception"]);
  const VIEW_MODES = new Set(["overview", "stage", "diagnostic"]);
  const NODE_WIDTH = 300;
  const NODE_HEIGHT = 180;
  const ROW_GAP = 30;
  const COLUMN_GAP = 72;
  const STAGE_GAP = 112;
  const TOP = 174;
  const LEFT = 118;
  const MAX_ROWS = 6;

  const uniq = (values) => [...new Set((values || []).filter(Boolean))];
  const numericStage = (call) => Number(call?.order?.stage ?? 1);
  const numericStep = (call) => Number(call?.displayStep ?? call?.order?.step ?? 0);
  const hasNumericValue = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

  function flowKind(call) {
    if (call?.isRegistryBoundary) return "registry";
    if (call?.flowKind === "exception") return "exception";
    if (call?.flowKind === "async") return "async";
    if ((call?.guardConditions || []).length || call?.guardSummary) return "conditional";
    return "main";
  }

  function matchesFlow(call, filter) {
    const selected = FLOW_FILTERS.has(filter) ? filter : "all";
    if (call?.isRegistryBoundary) return true;
    return selected === "all" || flowKind(call) === selected;
  }

  function flowLabel(kind) {
    return {
      all: "Все пути",
      main: "Основной поток",
      conditional: "Условные ветки",
      async: "Асинхронные",
      exception: "Аварийные",
    }[kind] || "Все пути";
  }

  function viewLabel(mode) {
    return {
      overview: "Обзор этапов",
      stage: "Разбор этапа",
      diagnostic: "Технический граф",
    }[mode] || "Обзор этапов";
  }

  function assignChannels(relations, callById) {
    const outgoing = new Map();
    const incoming = new Map();
    for (const relation of relations) {
      if (!outgoing.has(relation.fromCallId)) outgoing.set(relation.fromCallId, []);
      if (!incoming.has(relation.toCallId)) incoming.set(relation.toCallId, []);
      outgoing.get(relation.fromCallId).push(relation);
      incoming.get(relation.toCallId).push(relation);
    }
    const sortByStep = (key) => (left, right) => numericStep(callById.get(left[key])) - numericStep(callById.get(right[key]));
    for (const group of outgoing.values()) {
      group.sort(sortByStep("toCallId"));
      group.forEach((relation, index) => {
        relation.sourceChannelIndex = index;
        relation.sourceChannelCount = group.length;
      });
    }
    for (const group of incoming.values()) {
      group.sort(sortByStep("fromCallId"));
      group.forEach((relation, index) => {
        relation.targetChannelIndex = index;
        relation.targetChannelCount = group.length;
      });
    }
  }

  function terminalModel(calls, relations, width, label = "Конец") {
    const incoming = new Set(relations.map((relation) => relation.toCallId));
    const outgoing = new Set(relations.map((relation) => relation.fromCallId));
    const roots = calls.filter((call) => !incoming.has(call.id));
    const leaves = calls.filter((call) => !outgoing.has(call.id));
    const centerY = (items) => items.length
      ? items.reduce((sum, call) => sum + call.processMap.y + call.processMap.height / 2, 0) / items.length
      : TOP + NODE_HEIGHT / 2;
    const points = leaves.map((call) => ({
      sourceCallId: call.id,
      x: Math.min(width - 42, call.processMap.x + call.processMap.width + 62),
      y: call.processMap.y + call.processMap.height / 2,
      kind: call.flowKind === "exception" ? "exception_end" : "end",
      label: call.flowKind === "exception" ? "Конец аварийной ветки" : label,
    }));
    return {
      start: { x: 48, y: centerY(roots), targetCallIds: roots.map((call) => call.id) },
      end: {
        x: points.length ? Math.max(...points.map((point) => point.x)) : width - 42,
        y: centerY(leaves),
        sourceCallIds: leaves.map((call) => call.id),
        points,
      },
    };
  }

  function stagePurpose(calls) {
    const purposes = uniq(calls.map((call) => call.order?.purpose).filter(Boolean));
    if (purposes.length === 1) return purposes[0];
    if (purposes.length > 1) return `${purposes.length} назначения действий доступны в разборе этапа`;
    return "Назначение этапа раскрывается через его действия и доказанные переходы";
  }

  function buildOverview(fullLayout, flowFilter) {
    const visibleCalls = fullLayout.calls.filter((call) => matchesFlow(call, flowFilter));
    const visibleIds = new Set(visibleCalls.map((call) => call.id));
    const stageDefinitions = fullLayout.stages
      .map((stage) => ({
        stage,
        calls: visibleCalls.filter((call) => numericStage(call) === Number(stage.stage)),
      }))
      .filter((item) => item.calls.length);
    const calls = stageDefinitions.map(({ stage, calls: stageCalls }, index) => {
      const kinds = stageCalls.reduce((counts, call) => {
        const kind = flowKind(call);
        counts[kind] = (counts[kind] || 0) + 1;
        return counts;
      }, {});
      const uniqueOperations = new Set(stageCalls.map((call) => call.originalCallId || call.contractId || call.id)).size;
      const services = uniq(stageCalls.flatMap((call) => [call.sourceLabel, call.targetLabel]));
      const fields = stageCalls.reduce((sum, call) => sum + Number(call.fieldCount || 0), 0);
      const call = {
        id: `overview-stage-${stage.stage}`,
        isStageSummary: true,
        isRegistryBoundary: stage.isRegistryBoundary,
        stageRef: stage.stage,
        stageLabel: stage.label,
        sourceLabel: stage.label,
        targetLabel: stage.executionSummary || "порядок по коду",
        payload: stagePurpose(stageCalls),
        tier: "confirmed",
        flowKind: "main",
        fieldCount: fields,
        occurrenceCount: stageCalls.length,
        uniqueOperationCount: uniqueOperations,
        services,
        flowCounts: kinds,
        order: {
          stage: stage.stage,
          step: stage.stage,
          purpose: stagePurpose(stageCalls),
          reason: stage.executionSummary || "порядок по коду",
        },
        processMap: {
          x: LEFT + index * (NODE_WIDTH + STAGE_GAP),
          y: TOP,
          width: NODE_WIDTH,
          height: NODE_HEIGHT + 30,
        },
      };
      return call;
    });
    const callById = new Map(calls.map((call) => [call.id, call]));
    const overviewIdByStage = new Map(calls.map((call) => [Number(call.stageRef), call.id]));
    const relationGroups = new Map();
    for (const relation of fullLayout.relations) {
      if (!visibleIds.has(relation.fromCallId) || !visibleIds.has(relation.toCallId)) continue;
      const from = fullLayout.callById.get(relation.fromCallId);
      const to = fullLayout.callById.get(relation.toCallId);
      const fromStage = numericStage(from);
      const toStage = numericStage(to);
      if (fromStage === toStage) continue;
      const cssClass = relation.cssClass || "ordered";
      const key = `${fromStage}|${toStage}|${cssClass}`;
      if (!relationGroups.has(key)) {
        relationGroups.set(key, {
          ...relation,
          id: `overview-relation-${relationGroups.size + 1}`,
          fromCallId: overviewIdByStage.get(fromStage),
          toCallId: overviewIdByStage.get(toStage),
          routeCount: 0,
          relationKinds: [],
          routePairs: [],
        });
      }
      const group = relationGroups.get(key);
      group.routeCount += 1;
      group.relationKinds = uniq([...group.relationKinds, relation.kind]);
      group.routePairs = uniq([...group.routePairs, relation.routeLabel]);
    }
    const relations = [...relationGroups.values()].filter((relation) => relation.fromCallId && relation.toCallId);
    for (const relation of relations) {
      relation.label = relation.routeCount > 1
        ? `${relation.routeCount} доказанных переходов между этапами`
        : relation.label;
      relation.routeLabel = relation.routeCount > 1 ? `${relation.routeCount} связи` : "";
      relation.routeLabelWidth = relation.routeCount > 1 ? 62 : 0;
      relation.showRouteLabel = relation.routeCount > 1;
    }
    assignChannels(relations, callById);
    const stages = calls.map((call) => ({
      stage: call.stageRef,
      label: call.stageLabel,
      isRegistryBoundary: call.isRegistryBoundary,
      x: call.processMap.x - 20,
      width: call.processMap.width + 40,
      callCount: call.occurrenceCount,
      callCountLabel: `${call.uniqueOperationCount} операций · ${call.occurrenceCount} появлений`,
      callIds: [call.id],
      executionSummary: call.targetLabel,
    }));
    const width = Math.max(980, calls.length ? calls[calls.length - 1].processMap.x + NODE_WIDTH + 130 : 980);
    const height = 560;
    const terminals = terminalModel(calls, relations, width, "Конец этапов");
    return {
      ...fullLayout,
      ...terminals,
      viewMode: "overview",
      flowFilter,
      width,
      height,
      calls,
      callById,
      relations,
      regions: [],
      stages,
      overviewSourceCallCount: visibleCalls.length,
    };
  }

  function guardKey(call) {
    return (call.guardConditions || [])
      .map((guard) => `${guard.branch || "then"}:${guard.condition || ""}`)
      .sort()
      .join("|");
  }

  function groupKey(call) {
    if (call.isRegistryBoundary) return `registry:${call.id}`;
    return [
      numericStage(call),
      call.originalCallId || call.contractId || call.id,
      flowKind(call),
      guardKey(call),
    ].join("|");
  }

  function groupCalls(calls, selectedIds, selectedStage) {
    const groups = new Map();
    for (const call of calls) {
      const key = groupKey(call);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(call);
    }
    const oldToGroup = new Map();
    const grouped = [...groups.values()].map((members, index) => {
      const first = members[0];
      const steps = uniq(members.map(numericStep).filter(Number.isFinite)).sort((a, b) => a - b);
      const selectedMembers = members.filter((call) => selectedIds.has(call.id));
      const contextStages = uniq(members.map(numericStage));
      const contextDirection = contextStages.every((stage) => stage < selectedStage)
        ? "incoming"
        : contextStages.every((stage) => stage > selectedStage)
          ? "outgoing"
          : "mixed";
      const groupedCall = {
        ...first,
        id: `stage-group-${index + 1}`,
        memberCallIds: members.map((call) => call.id),
        occurrenceCount: members.length,
        occurrenceSteps: steps,
        displayStep: steps[0] || numericStep(first),
        displayStepLabel: steps.length > 1 ? steps.join(", ") : String(steps[0] || numericStep(first) || "?"),
        isContext: selectedMembers.length === 0,
        contextDirection,
        fieldCount: Math.max(...members.map((call) => Number(call.fieldCount || 0))),
        guardConditions: uniq(members.flatMap((call) => call.guardConditions || []).map((guard) => JSON.stringify(guard)))
          .map((value) => JSON.parse(value)),
        processIr: {
          ...(first.processIr || {}),
          nodeIds: uniq(members.flatMap((call) => call.processIr?.nodeIds || [])),
        },
      };
      if (members.length > 1) {
        groupedCall.executionLabel = `${members.length} эквивалентных появлений схлопнуто`;
      } else if (groupedCall.isContext) {
        groupedCall.executionLabel = contextDirection === "incoming" ? "контекст до выбранного этапа" : "продолжение после выбранного этапа";
      }
      members.forEach((call) => oldToGroup.set(call.id, groupedCall.id));
      return groupedCall;
    });
    return { grouped, oldToGroup };
  }

  function groupStageContext(fullLayout, contextCalls, selectedStage, oldToGroup) {
    const byStage = new Map();
    for (const call of contextCalls) {
      const stage = numericStage(call);
      if (!byStage.has(stage)) byStage.set(stage, []);
      byStage.get(stage).push(call);
    }
    return [...byStage.entries()].sort(([left], [right]) => left - right).map(([stage, members], index) => {
      const stageDefinition = fullLayout.stages.find((item) => Number(item.stage) === Number(stage));
      const incoming = stage < selectedStage;
      const operations = new Set(members.map((call) => call.originalCallId || call.contractId || call.id));
      const services = uniq(members.flatMap((call) => [call.sourceLabel, call.targetLabel]));
      const registry = members.every((call) => call.isRegistryBoundary);
      const summary = {
        ...members[0],
        id: `stage-context-${stage}-${index + 1}`,
        isStageContextSummary: true,
        isRegistryBoundary: registry,
        isContext: true,
        contextDirection: incoming ? "incoming" : "outgoing",
        stageRef: stage,
        stageLabel: stageDefinition?.label || `Этап ${stage}`,
        sourceLabel: stageDefinition?.label || `Этап ${stage}`,
        targetLabel: incoming ? `вход в этап ${selectedStage}` : `продолжение после этапа ${selectedStage}`,
        payload: incoming ? "Входной контекст" : "Выходной контекст",
        flowKind: registry ? "registry" : "main",
        memberCallIds: members.map((call) => call.id),
        occurrenceCount: members.length,
        uniqueOperationCount: operations.size,
        services,
        fieldCount: members.reduce((sum, call) => sum + Number(call.fieldCount || 0), 0),
        guardConditions: [],
        guardSummary: "",
        executionLabel: incoming ? "непосредственный вход в выбранный этап" : "непосредственное продолжение выбранного этапа",
        order: {
          ...(members[0].order || {}),
          stage,
          step: Math.min(...members.map(numericStep).filter(Number.isFinite)),
          purpose: `${operations.size} операций соседнего этапа свёрнуты в контекст`,
          reason: incoming ? "контекст до выбранного этапа" : "контекст после выбранного этапа",
        },
        processIr: {
          nodeIds: uniq(members.flatMap((call) => call.processIr?.nodeIds || [])),
        },
      };
      members.forEach((call) => oldToGroup.set(call.id, summary.id));
      return summary;
    });
  }

  function relationGroups(fullLayout, visibleIds, oldToGroup) {
    const groups = new Map();
    for (const relation of fullLayout.relations) {
      if (!visibleIds.has(relation.fromCallId) || !visibleIds.has(relation.toCallId)) continue;
      const fromCallId = oldToGroup.get(relation.fromCallId);
      const toCallId = oldToGroup.get(relation.toCallId);
      if (!fromCallId || !toCallId || fromCallId === toCallId) continue;
      const key = `${fromCallId}|${toCallId}|${relation.cssClass || relation.kind || "ordered"}`;
      if (!groups.has(key)) {
        groups.set(key, {
          ...relation,
          id: `stage-relation-${groups.size + 1}`,
          fromCallId,
          toCallId,
          routeCount: 0,
          routePairs: [],
          relationKinds: [],
        });
      }
      const group = groups.get(key);
      group.routeCount += 1;
      group.routePairs = uniq([...group.routePairs, relation.routeLabel]);
      group.relationKinds = uniq([...group.relationKinds, relation.kind]);
    }
    const relations = [...groups.values()];
    for (const relation of relations) {
      relation.label = relation.routeCount > 1
        ? `${relation.routeCount} эквивалентных переходов схлопнуто`
        : relation.label;
      relation.routeLabel = relation.routeCount > 1 ? `${relation.routeCount}×` : (relation.routePairs[0] || "");
      relation.routeLabelWidth = relation.routeCount > 1 ? 38 : 42;
      relation.showRouteLabel = Boolean(relation.routeLabel);
    }
    return relations;
  }

  function layoutGroupedCalls(calls, selectedStage) {
    const stages = uniq(calls.map(numericStage)).sort((a, b) => a - b);
    const stageLayouts = [];
    let cursorX = LEFT;
    let maxBottom = TOP + NODE_HEIGHT;
    for (const stage of stages) {
      const stageCalls = calls.filter((call) => numericStage(call) === stage);
      const columnCount = Math.max(1, Math.ceil(stageCalls.length / MAX_ROWS));
      const stageWidth = columnCount * NODE_WIDTH + Math.max(0, columnCount - 1) * COLUMN_GAP;
      stageCalls.forEach((call, index) => {
        const column = Math.floor(index / MAX_ROWS);
        const row = index % MAX_ROWS;
        call.processMap = {
          x: cursorX + column * (NODE_WIDTH + COLUMN_GAP),
          y: TOP + row * (NODE_HEIGHT + ROW_GAP),
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        };
        maxBottom = Math.max(maxBottom, call.processMap.y + NODE_HEIGHT);
      });
      const selected = Number(stage) === Number(selectedStage);
      stageLayouts.push({
        stage,
        label: selected ? `Этап ${stage} · выбран` : `Контекст · этап ${stage}`,
        selected,
        isRegistryBoundary: stageCalls.every((call) => call.isRegistryBoundary),
        x: cursorX - 22,
        width: stageWidth + 44,
        callCount: stageCalls.length,
        callCountLabel: `${stageCalls.length} сгруппированных действий`,
        callIds: stageCalls.map((call) => call.id),
        executionSummary: selected ? "детальный разбор" : "один переход от выбранного этапа",
      });
      cursorX += stageWidth + STAGE_GAP;
    }
    return {
      stages: stageLayouts,
      width: Math.max(980, cursorX + 90),
      height: Math.max(620, maxBottom + 110),
    };
  }

  function remapRegions(fullLayout, visibleIds, oldToGroup, callById) {
    return fullLayout.regions.map((region) => {
      const memberCallIds = uniq((region.memberCallIds || [])
        .filter((callId) => visibleIds.has(callId))
        .map((callId) => oldToGroup.get(callId)));
      const memberCalls = memberCallIds.map((callId) => callById.get(callId)).filter(Boolean);
      if (!memberCalls.length) return null;
      const minX = Math.min(...memberCalls.map((call) => call.processMap.x));
      const minY = Math.min(...memberCalls.map((call) => call.processMap.y));
      const maxX = Math.max(...memberCalls.map((call) => call.processMap.x + call.processMap.width));
      const maxY = Math.max(...memberCalls.map((call) => call.processMap.y + call.processMap.height));
      const remappedLinks = new Map();
      for (const link of region.links || []) {
        const targetCallId = oldToGroup.get(link.targetCallId);
        if (!targetCallId) continue;
        if (!remappedLinks.has(targetCallId)) {
          remappedLinks.set(targetCallId, { targetCallId, labels: [], sourceCount: 0 });
        }
        const remapped = remappedLinks.get(targetCallId);
        remapped.labels = uniq([...remapped.labels, link.label]);
        remapped.sourceCount += 1;
      }
      const links = [...remappedLinks.values()].map((link, index, all) => ({
        label: link.labels.join(" / ") || "ветка",
        targetCallId: link.targetCallId,
        index,
        count: all.length,
        sourceCount: link.sourceCount,
      }));
      return {
        ...region,
        memberCallIds,
        links,
        x: Math.max(42, minX - 58),
        y: Math.max(72, minY - 72),
        bounds: {
          x: minX - 12,
          y: minY - 36,
          width: maxX - minX + 24,
          height: maxY - minY + 48,
        },
      };
    }).filter(Boolean);
  }

  function buildStage(fullLayout, selectedStage, flowFilter) {
    const stage = hasNumericValue(selectedStage)
      ? Number(selectedStage)
      : Number(fullLayout.stages.find((item) => !item.isRegistryBoundary)?.stage ?? fullLayout.stages[0]?.stage ?? 1);
    const targetCalls = fullLayout.calls.filter((call) => numericStage(call) === stage && matchesFlow(call, flowFilter));
    if (!targetCalls.length) {
      return {
        ...fullLayout,
        viewMode: "stage",
        flowFilter,
        selectedStage: stage,
        calls: [],
        callById: new Map(),
        relations: [],
        regions: [],
        stages: [],
        filterEmpty: true,
      };
    }
    const selectedIds = new Set(targetCalls.map((call) => call.id));
    const contextIds = new Set();
    for (const relation of fullLayout.relations) {
      if (selectedIds.has(relation.fromCallId) && !selectedIds.has(relation.toCallId)) contextIds.add(relation.toCallId);
      if (selectedIds.has(relation.toCallId) && !selectedIds.has(relation.fromCallId)) contextIds.add(relation.fromCallId);
    }
    const contextCalls = fullLayout.calls.filter((call) => contextIds.has(call.id) && numericStage(call) !== stage);
    const visibleSourceCalls = [...targetCalls, ...contextCalls];
    const visibleIds = new Set(visibleSourceCalls.map((call) => call.id));
    const { grouped: selectedCalls, oldToGroup } = groupCalls(targetCalls, selectedIds, stage);
    const contextSummaries = groupStageContext(fullLayout, contextCalls, stage, oldToGroup);
    const calls = [...selectedCalls, ...contextSummaries];
    const layout = layoutGroupedCalls(calls, stage);
    const callById = new Map(calls.map((call) => [call.id, call]));
    const relations = relationGroups(fullLayout, visibleIds, oldToGroup);
    assignChannels(relations, callById);
    const regions = remapRegions(fullLayout, selectedIds, oldToGroup, callById);
    const terminals = terminalModel(calls, relations, layout.width, "Выход из этапа");
    return {
      ...fullLayout,
      ...layout,
      ...terminals,
      viewMode: "stage",
      flowFilter,
      selectedStage: stage,
      calls,
      callById,
      relations,
      regions,
      groupedOccurrenceCount: targetCalls.length - selectedCalls.length,
      contextOccurrenceCount: contextCalls.length,
      contextualStageCount: contextSummaries.length,
    };
  }

  function buildDiagnostic(fullLayout, flowFilter) {
    if (flowFilter === "all") return { ...fullLayout, viewMode: "diagnostic", flowFilter };
    const calls = fullLayout.calls.filter((call) => matchesFlow(call, flowFilter));
    const visibleIds = new Set(calls.map((call) => call.id));
    const callById = new Map(calls.map((call) => [call.id, call]));
    const relations = fullLayout.relations.filter((relation) => (
      visibleIds.has(relation.fromCallId) && visibleIds.has(relation.toCallId)
    ));
    const stages = fullLayout.stages
      .map((stage) => ({ ...stage, callIds: stage.callIds.filter((id) => visibleIds.has(id)) }))
      .filter((stage) => stage.callIds.length);
    const regions = fullLayout.regions
      .map((region) => ({
        ...region,
        memberCallIds: (region.memberCallIds || []).filter((id) => visibleIds.has(id)),
        links: (region.links || []).filter((link) => visibleIds.has(link.targetCallId)),
      }))
      .filter((region) => region.memberCallIds.length);
    const terminals = terminalModel(calls, relations, fullLayout.width);
    return {
      ...fullLayout,
      ...terminals,
      viewMode: "diagnostic",
      flowFilter,
      calls,
      callById,
      relations,
      regions,
      stages,
    };
  }

  function build(fullLayout, options = {}) {
    const viewMode = VIEW_MODES.has(options.viewMode) ? options.viewMode : "overview";
    const flowFilter = FLOW_FILTERS.has(options.flowFilter) ? options.flowFilter : "all";
    if (!fullLayout?.calls?.length) return fullLayout;
    if (viewMode === "stage") return buildStage(fullLayout, options.selectedStage, flowFilter);
    if (viewMode === "diagnostic") return buildDiagnostic(fullLayout, flowFilter);
    return buildOverview(fullLayout, flowFilter);
  }

  global.AIProfilerProcessMapPresentation = {
    build,
    flowKind,
    flowLabel,
    matchesFlow,
    viewLabel,
  };
})(window);
