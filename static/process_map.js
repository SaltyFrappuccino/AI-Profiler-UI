(function initProcessMap(global) {
  const NODE_WIDTH = 284;
  const NODE_HEIGHT = 148;
  const ROW_GAP = 34;
  const COLUMN_GAP = 76;
  const STAGE_GAP = 116;
  const MAX_ROWS = 5;
  const TOP = 166;
  const LEFT = 126;
  const GATEWAY_TOP = 72;
  const GATEWAY_LABEL_WIDTH = 142;
  const GATEWAY_HORIZONTAL_GAP = 24;
  const GATEWAY_COLLISION_HEIGHT = 76;
  const GATEWAY_MAX_PLACEMENT_ATTEMPTS = 12;
  const EXCEPTION_LANE_GAP = 92;

  const uniq = (items) => [...new Set((items || []).filter(Boolean))];
  const majorRegionKinds = new Set(["choice", "parallel", "async_task", "exception", "loop"]);

  function regionLabel(kind) {
    return {
      choice: "Развилка",
      parallel: "Параллельный блок",
      async_task: "Асинхронная задача",
      exception: "Аварийная ветка",
      loop: "Цикл",
      guard: "Условие",
    }[kind] || kind || "Управляющий блок";
  }

  function regionSymbol(kind) {
    return {
      choice: "×",
      parallel: "+",
      async_task: "↗",
      exception: "!",
      loop: "↻",
    }[kind] || "·";
  }

  function regionScope(kind) {
    return {
      choice: "одна из веток",
      parallel: "независимые ветки",
      async_task: "отдельный поток",
      exception: "только при ошибке",
      loop: "повтор участка",
    }[kind] || "управление потоком";
  }

  function relationLabel(kind) {
    return {
      ordered_before: "порядок доказан кодом",
      causal_continuation: "причинное продолжение",
      synchronous_continuation: "синхронное продолжение",
      async_handoff: "асинхронная передача",
      loop_back: "возврат цикла",
      registry_context: "ожидаемая граница из архитектурного реестра",
    }[kind] || kind || "переход";
  }

  function relationClass(kind) {
    if (kind === "async_handoff") return "async";
    if (kind === "loop_back") return "loop";
    if (kind === "causal_continuation") return "causal";
    if (kind === "registry_context") return "registry";
    return "ordered";
  }

  function memberNodeIds(region) {
    return uniq([
      ...(region.nodeIds || []),
      ...(region.arms || []).flatMap((arm) => arm.nodeIds || []),
      ...(region.tasks || []).flatMap((task) => task.nodeIds || []),
    ]);
  }

  function occurrenceId(call, node, index) {
    const suffix = node?.executionRouteId || node?.nodeId || node?.displayIndex || index + 1;
    return `${call.id}::${suffix}`;
  }

  function executionLabel(node, controlRegions, incomingRelation) {
    if (controlRegions.some((region) => region.kind === "exception")) return "только при исключении";
    if (incomingRelation?.kind === "async_handoff") return `асинхронно после шага ${incomingRelation.fromDisplayIndex || "?"}`;
    const guards = controlRegions.filter((region) => region.kind === "guard" && region.condition);
    if (guards.length === 1) return `по условию: ${guards[0].condition}`;
    if (guards.length > 1) return `условный путь · ${guards.length} условия в коде`;
    if (incomingRelation?.fromDisplayIndex) return `после шага ${incomingRelation.fromDisplayIndex}`;
    if (node?.ordering === "entry") return "точка входа";
    return node?.executionMode === "parallel" ? "параллельная ветка" : "порядок не доказан";
  }

  function actionCountLabel(value) {
    const count = Math.abs(Number(value || 0)) % 100;
    const last = count % 10;
    if (count > 10 && count < 20) return `${value} действий`;
    if (last === 1) return `${value} действие`;
    if (last >= 2 && last <= 4) return `${value} действия`;
    return `${value} действий`;
  }

  function expandCodeCalls(processIr, calls) {
    const nodeById = new Map((processIr.nodes || []).map((node) => [node.nodeId, node]));
    const regions = processIr.controlRegions || [];
    const incomingByNodeId = new Map((processIr.relations || []).map((relation) => [relation.toNodeId, relation]));
    const displayIndexByNodeId = new Map((processIr.nodes || []).map((node) => [node.nodeId, node.displayIndex]));
    return calls.flatMap((call) => {
      const nodeIds = (call.processIr?.nodeIds || []).filter((nodeId) => nodeById.has(nodeId));
      if (!nodeIds.length) return [{ ...call, originalCallId: call.id, flowKind: "main", executionLabel: "позиция не доказана" }];
      return nodeIds.map((nodeId, index) => {
        const node = nodeById.get(nodeId);
        const controlRegions = regions.filter((region) => memberNodeIds(region).includes(nodeId));
        const exceptionRegion = controlRegions.find((region) => region.kind === "exception");
        const asyncRegion = controlRegions.find((region) => region.kind === "async_task");
        const incoming = incomingByNodeId.get(nodeId);
        const incomingRelation = incoming ? {
          ...incoming,
          fromDisplayIndex: displayIndexByNodeId.get(incoming.fromNodeId),
        } : null;
        const displayStep = Number(node.displayIndex ?? call.processIr?.displayIndex ?? call.order?.step ?? 0);
        return {
          ...call,
          id: occurrenceId(call, node, index),
          originalCallId: call.id,
          displayStep,
          flowKind: exceptionRegion ? "exception" : asyncRegion ? "async" : "main",
          executionLabel: executionLabel(node, controlRegions, incomingRelation),
          controlContexts: controlRegions.map((region) => ({
            id: region.regionId,
            kind: region.kind,
            condition: region.condition || "",
            sourceLine: region.sourceLine,
          })),
          executionNode: node,
          order: {
            ...call.order,
            step: displayStep,
            stage: Number(node.stage ?? call.order?.stage ?? 1),
            processIr: {
              ...(call.order?.processIr || {}),
              displayIndex: displayStep,
              causalRelations: incomingRelation ? [incomingRelation] : [],
              unsequenced: !incomingRelation && node.ordering !== "entry",
              predecessorDisplayIndex: incomingRelation?.fromDisplayIndex || null,
              regionKinds: uniq(controlRegions.map((region) => region.kind)),
              branchLabels: uniq(controlRegions
                .filter((region) => region.kind === "guard")
                .map((region) => region.condition)),
            },
          },
          processIr: {
            ...call.processIr,
            displayIndex: displayStep,
            nodeIds: [nodeId],
            occurrenceNodeId: nodeId,
          },
        };
      });
    });
  }

  function build(process, calls) {
    const processIr = process?.processIr || {};
    const sourceCodeCalls = (calls || [])
      .filter((call) => !call.isBridge && call.order?.processId === process?.processId)
      .sort((a, b) => Number(a.processIr?.displayIndex ?? a.order?.step ?? 0)
        - Number(b.processIr?.displayIndex ?? b.order?.step ?? 0));
    const codeCalls = expandCodeCalls(processIr, sourceCodeCalls)
      .sort((a, b) => Number(a.displayStep || 0) - Number(b.displayStep || 0));
    const codeStages = codeCalls.map((call) => Number(call.order?.stage ?? 1));
    const firstStage = codeStages.length ? Math.min(...codeStages) : 1;
    const lastStage = codeStages.length ? Math.max(...codeStages) : 1;
    const registryCalls = (process?.architectureRegistryBoundaries || []).map((boundary, index) => {
      const inbound = boundary.direction === "inbound";
      const businessPoint = (boundary.businessPoints || []).find(Boolean);
      const businessName = (boundary.businessNames || []).find(Boolean);
      return {
        id: boundary.boundaryId || `registry-boundary-${index + 1}`,
        isRegistryBoundary: true,
        registryBoundary: boundary,
        tier: "registry",
        sourceService: inbound ? `registry:${boundary.externalComponent || index}` : boundary.internalService,
        targetService: inbound ? boundary.internalService : `registry:${boundary.externalComponent || index}`,
        sourceLabel: boundary.sourceLabel || (inbound ? boundary.externalComponent : boundary.internalService),
        targetLabel: boundary.targetLabel || (inbound ? boundary.internalService : boundary.externalComponent),
        payload: businessPoint || businessName || "Взаимодействие из архитектурного реестра",
        transport: boundary.transport || "architecture_registry",
        fields: [],
        fieldCount: 0,
        proof: boundary.evidenceStatus || "architecture_registry",
        responseSemantics: null,
        order: {
          processId: process.processId,
          processName: process.name,
          stage: inbound ? firstStage - 1 : lastStage + 1,
          step: inbound ? "вход" : "выход",
          reason: businessName || "Ожидаемое взаимодействие из архитектурного Excel",
          purpose: businessName || "",
          purposeSource: "architecture_registry",
        },
        processIr: { displayIndex: inbound ? -1 : Number.MAX_SAFE_INTEGER, nodeIds: [] },
      };
    });
    const processCalls = [...codeCalls, ...registryCalls]
      .sort((a, b) => Number(a.processIr?.displayIndex ?? a.order?.step ?? 0)
        - Number(b.processIr?.displayIndex ?? b.order?.step ?? 0));
    const callByNodeId = new Map();
    for (const call of codeCalls) {
      for (const nodeId of call.processIr?.nodeIds || []) callByNodeId.set(nodeId, call);
    }

    const relationKeys = new Set();
    const relations = [];
    for (const relation of processIr.relations || []) {
      const from = callByNodeId.get(relation.fromNodeId);
      const to = callByNodeId.get(relation.toNodeId);
      if (!from || !to || from.id === to.id) continue;
      const key = `${from.id}|${to.id}|${relation.kind || "ordered_before"}`;
      if (relationKeys.has(key)) continue;
      relationKeys.add(key);
      relations.push({
        ...relation,
        id: `process-relation-${relations.length + 1}`,
        fromCallId: from.id,
        toCallId: to.id,
        label: to.flowKind === "exception" ? "переход в обработчик исключения" : relationLabel(relation.kind),
        cssClass: to.flowKind === "exception" ? "exception" : relationClass(relation.kind),
      });
    }
    const callByStepId = new Map();
    for (const call of codeCalls) {
      for (const stepId of uniq([call.stepId, ...(call.rawStepIds || [])])) callByStepId.set(stepId, call);
    }
    for (const call of registryCalls) {
      const boundary = call.registryBoundary || {};
      const inbound = boundary.direction === "inbound";
      const anchor = callByStepId.get(inbound ? boundary.beforeStepId : boundary.afterStepId)
        || (inbound ? codeCalls[0] : codeCalls[codeCalls.length - 1]);
      if (!anchor) continue;
      const from = inbound ? call : anchor;
      const to = inbound ? anchor : call;
      const key = `${from.id}|${to.id}|registry_context`;
      if (relationKeys.has(key)) continue;
      relationKeys.add(key);
      relations.push({
        id: `process-relation-${relations.length + 1}`,
        kind: "registry_context",
        fromCallId: from.id,
        toCallId: to.id,
        label: relationLabel("registry_context"),
        cssClass: relationClass("registry_context"),
        reason: boundary.evidenceStatus === "code_boundary_and_registry"
          ? "исходящая граница найдена в коде и сопоставлена со строкой Excel"
          : "направление и участник заданы архитектурным Excel; позиция привязана к точке входа процесса",
      });
    }

    const stages = [...new Set(processCalls.map((call) => Number(call.order?.stage ?? 1)))]
      .sort((a, b) => a - b);
    const stageLayouts = [];
    let cursorX = LEFT;
    let maxBottom = TOP + NODE_HEIGHT;
    for (const stage of stages) {
      const stageCalls = processCalls.filter((call) => Number(call.order?.stage ?? 1) === stage);
      const regularCalls = stageCalls.filter((call) => call.flowKind !== "exception");
      const exceptionCalls = stageCalls.filter((call) => call.flowKind === "exception");
      const regularColumnCount = Math.max(1, Math.ceil(regularCalls.length / MAX_ROWS));
      const exceptionColumnCount = exceptionCalls.length ? Math.max(1, Math.ceil(exceptionCalls.length / MAX_ROWS)) : 0;
      const columnCount = Math.max(regularColumnCount, exceptionColumnCount);
      const stageWidth = columnCount * NODE_WIDTH + Math.max(0, columnCount - 1) * COLUMN_GAP;
      regularCalls.forEach((call, index) => {
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
      const regularRows = Math.min(MAX_ROWS, Math.max(1, regularCalls.length));
      const exceptionTop = TOP + regularRows * (NODE_HEIGHT + ROW_GAP) + EXCEPTION_LANE_GAP;
      exceptionCalls.forEach((call, index) => {
        const column = Math.floor(index / MAX_ROWS);
        const row = index % MAX_ROWS;
        call.processMap = {
          x: cursorX + column * (NODE_WIDTH + COLUMN_GAP),
          y: exceptionTop + row * (NODE_HEIGHT + ROW_GAP),
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        };
        maxBottom = Math.max(maxBottom, call.processMap.y + NODE_HEIGHT);
      });
      stageLayouts.push({
        stage,
        label: stageCalls.every((call) => call.isRegistryBoundary)
          ? (stageCalls[0]?.registryBoundary?.direction === "inbound" ? "Вход бизнес-контура" : "Внешние продолжения")
          : `Этап ${stage}`,
        isRegistryBoundary: stageCalls.every((call) => call.isRegistryBoundary),
        x: cursorX - 22,
        width: stageWidth + 44,
        callCount: stageCalls.length,
        callCountLabel: actionCountLabel(stageCalls.length),
        callIds: stageCalls.map((call) => call.id),
        executionSummary: exceptionCalls.length
          ? `${regularCalls.length} в основном пути · ${exceptionCalls.length} только при ошибке`
          : (regularCalls.some((call) => call.flowKind === "async") ? "в отдельном потоке" : "порядок по коду"),
      });
      cursorX += stageWidth + STAGE_GAP;
    }

    const callById = new Map(processCalls.map((call) => [call.id, call]));
    const incoming = new Set(relations.map((relation) => relation.toCallId));
    const outgoing = new Set(relations.map((relation) => relation.fromCallId));
    const roots = processCalls.filter((call) => !incoming.has(call.id));
    const leaves = processCalls.filter((call) => !outgoing.has(call.id));
    const regions = [];
    const occupiedGateways = [];
    for (const region of processIr.controlRegions || []) {
      if (!majorRegionKinds.has(region.kind)) continue;
      const memberCalls = uniq(memberNodeIds(region).map((nodeId) => callByNodeId.get(nodeId)?.id))
        .map((callId) => callById.get(callId))
        .filter(Boolean);
      if (!memberCalls.length) continue;
      const minX = Math.min(...memberCalls.map((call) => call.processMap.x));
      const minY = Math.min(...memberCalls.map((call) => call.processMap.y));
      const maxX = Math.max(...memberCalls.map((call) => call.processMap.x + call.processMap.width));
      const maxY = Math.max(...memberCalls.map((call) => call.processMap.y + call.processMap.height));
      const hostStage = stageLayouts.find((stage) => memberCalls.some((call) => stage.callIds.includes(call.id)));
      const baseX = hostStage && ["parallel", "async_task"].includes(region.kind)
        ? hostStage.x + 46
        : hostStage && region.kind === "exception"
          ? hostStage.x + hostStage.width - 104
          : Math.max(46, minX - 64);
      const gatewaySpacing = GATEWAY_LABEL_WIDTH + GATEWAY_HORIZONTAL_GAP;
      const maxGatewayX = Math.max(46, cursorX - GATEWAY_LABEL_WIDTH - 16);
      let gatewayX = baseX;
      const gatewayY = Math.max(GATEWAY_TOP, minY - 74);
      let attempt = 0;
      while (occupiedGateways.some((point) => (
        Math.abs(point.x - gatewayX) < gatewaySpacing
        && Math.abs(point.y - gatewayY) < GATEWAY_COLLISION_HEIGHT
      ))) {
        attempt += 1;
        const lane = Math.ceil(attempt / 2);
        const direction = attempt % 2 ? 1 : -1;
        gatewayX = Math.min(maxGatewayX, Math.max(46, baseX + direction * lane * gatewaySpacing));
        if (attempt > GATEWAY_MAX_PLACEMENT_ATTEMPTS) break;
      }
      occupiedGateways.push({ x: gatewayX, y: gatewayY });
      const groups = region.arms?.length
        ? region.arms.map((arm) => ({ label: arm.label || "ветка", nodeIds: arm.nodeIds || [] }))
        : region.tasks?.length
          ? region.tasks.map((task) => ({ label: task.label || task.taskId || "задача", nodeIds: task.nodeIds || [] }))
          : region.nodeIds?.length
            ? [{ label: region.kind === "exception" ? "обработчик ошибки" : "управляемый участок", nodeIds: region.nodeIds }]
            : [];
      const links = groups.map((group) => {
        const target = group.nodeIds.map((nodeId) => callByNodeId.get(nodeId)).find(Boolean);
        return target ? { label: group.label, targetCallId: target.id } : null;
      }).filter(Boolean);
      regions.push({
        ...region,
        id: region.regionId || `process-region-${regions.length + 1}`,
        label: regionLabel(region.kind),
        scopeLabel: regionScope(region.kind),
        symbol: regionSymbol(region.kind),
        memberCallIds: memberCalls.map((call) => call.id),
        links,
        bounds: {
          x: minX - 12,
          y: minY - 38,
          width: maxX - minX + 24,
          height: maxY - minY + 50,
        },
        frameLabel: region.kind === "exception"
          ? "Аварийный путь · выполняется только при исключении"
          : region.kind === "async_task"
            ? "Отдельный поток · запущен асинхронно"
            : regionLabel(region.kind),
        x: gatewayX,
        y: gatewayY,
      });
    }

    const avgY = (items) => items.length
      ? items.reduce((sum, call) => sum + call.processMap.y + NODE_HEIGHT / 2, 0) / items.length
      : TOP + NODE_HEIGHT / 2;
    const width = Math.max(1160, cursorX + 112);
    const height = Math.max(640, maxBottom + 112);
    const endPoints = leaves.map((call) => ({
      sourceCallId: call.id,
      x: width - 48,
      y: call.processMap.y + call.processMap.height / 2,
      kind: call.isRegistryBoundary ? "external_boundary" : call.flowKind === "exception" ? "exception_end" : "end",
      label: call.isRegistryBoundary
        ? "Вне корпуса"
        : call.flowKind === "exception"
          ? "Конец аварийной ветки"
          : (leaves.length > 1 ? "Конец ветки" : "Конец"),
    }));
    return {
      width,
      height,
      nodeWidth: NODE_WIDTH,
      nodeHeight: NODE_HEIGHT,
      calls: processCalls,
      callById,
      relations,
      regions,
      stages: stageLayouts,
      start: { x: 52, y: avgY(roots), targetCallIds: roots.map((call) => call.id) },
      end: {
        x: width - 48,
        y: avgY(leaves),
        sourceCallIds: leaves.map((call) => call.id),
        points: endPoints,
      },
      runtimeTraceSafe: processIr.runtimeTraceSafe !== false,
      unsequencedCount: Number(processIr.summary?.unsequencedNodeCount || 0),
    };
  }

  function edgePath(from, to) {
    const x1 = from.processMap.x + from.processMap.width;
    const y1 = from.processMap.y + from.processMap.height / 2;
    const x2 = to.processMap.x;
    const y2 = to.processMap.y + to.processMap.height / 2;
    if (x2 > x1 + 46) {
      const middle = x1 + (x2 - x1) / 2;
      return `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`;
    }
    const lane = Math.max(from.processMap.y + from.processMap.height, to.processMap.y + to.processMap.height) + 22;
    return `M ${x1} ${y1} H ${x1 + 34} V ${lane} H ${x2 - 34} V ${y2} H ${x2}`;
  }

  function controlPath(region, target) {
    const x1 = region.x + 25;
    const y1 = region.y + 25;
    const x2 = target.processMap.x + 18;
    const y2 = target.processMap.y;
    return `M ${x1} ${y1} V ${Math.max(y1 + 18, y2 - 24)} H ${x2} V ${y2}`;
  }

  global.AIProfilerProcessMap = {
    build,
    edgePath,
    controlPath,
    regionLabel,
    regionScope,
    relationLabel,
  };
})(window);
