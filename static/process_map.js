(function initProcessMap(global) {
  const NODE_WIDTH = 284;
  const NODE_HEIGHT = 184;
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
      async_task: "Асинхронный подпроцесс",
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
      parallel: "ветви стартуют независимо",
      async_task: "новый поток выполнения",
      exception: "только при ошибке",
      loop: "повтор участка",
    }[kind] || "управление потоком";
  }

  function relationLabel(kind) {
    return {
      ordered_before: "порядок доказан кодом",
      causal_continuation: "причинное продолжение",
      synchronous_continuation: "синхронное продолжение",
      async_handoff: "передача в отдельный поток",
      async_spawn: "запуск отдельной задачи",
      parallel_join: "объединение параллельных ветвей",
      completion_callback: "обработчик завершения",
      loop_back: "возврат цикла",
      registry_context: "ожидаемая граница из архитектурного реестра",
    }[kind] || kind || "переход";
  }

  function relationClass(kind) {
    if (["async_handoff", "async_spawn", "completion_callback"].includes(kind)) return "async";
    if (kind === "parallel_join") return "join";
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

  function branchForNode(region, nodeId) {
    return (region.arms || []).find((arm) => (arm.nodeIds || []).includes(nodeId)) || null;
  }

  function guardContexts(controlRegions, nodeId) {
    return controlRegions
      .filter((region) => region.kind === "guard" && region.condition)
      .map((region) => {
        const arm = branchForNode(region, nodeId);
        return {
          id: region.regionId,
          condition: region.condition,
          branch: arm?.label || "then",
          ownerMethodId: region.ownerMethodId || "",
          sourceLine: region.sourceLine,
        };
      });
  }

  function compactCondition(value, maxLength = 72) {
    const text = String(value || "")
      .replace(/^\((.*)\)$/s, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function guardSummary(guards) {
    if (!guards.length) return "";
    if (guards.length > 1) return `${guards.length} условия · открыть детали`;
    const guard = guards[0];
    const prefix = guard.branch === "else" ? "иначе: " : "если: ";
    return `${prefix}${compactCondition(guard.condition)}`;
  }

  function executionLabel(node, controlRegions, incomingRelation) {
    if (controlRegions.some((region) => region.kind === "exception")) return "только при исключении";
    if (incomingRelation?.kind === "async_handoff") return `асинхронно после шага ${incomingRelation.fromDisplayIndex || "?"}`;
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
        const guards = guardContexts(controlRegions, nodeId);
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
          guardSummary: guardSummary(guards),
          guardConditions: guards,
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
                .map((region) => branchForNode(region, nodeId)?.label || "then")),
              branchConditions: guards,
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
      call.registryAnchorStep = anchor.displayStep ?? anchor.order?.step ?? null;
      call.registryPlacement = inbound ? "before_process" : "unsequenced_external";
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
        renderMode: inbound ? "message_flow" : "registry_reference",
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
      const registryStage = stageCalls.every((call) => call.isRegistryBoundary);
      const registryDirection = stageCalls[0]?.registryBoundary?.direction;
      stageLayouts.push({
        stage,
        label: registryStage
          ? (registryDirection === "inbound" ? "Вход бизнес-контура" : "Внешний контур")
          : `Этап ${stage}`,
        isRegistryBoundary: registryStage,
        x: cursorX - 22,
        width: stageWidth + 44,
        callCount: stageCalls.length,
        callCountLabel: actionCountLabel(stageCalls.length),
        callIds: stageCalls.map((call) => call.id),
        executionSummary: registryStage
          ? (registryDirection === "inbound"
            ? "контекст до точки входа · не шаг кода"
            : "порядок относительно шагов не доказан")
          : exceptionCalls.length
            ? `${regularCalls.length} в основном пути · ${exceptionCalls.length} только при ошибке`
            : (regularCalls.some((call) => call.flowKind === "async") ? "в отдельном потоке" : "порядок по коду"),
      });
      cursorX += stageWidth + STAGE_GAP;
    }

    const callById = new Map(processCalls.map((call) => [call.id, call]));
    for (const stage of stages) {
      const stageCalls = processCalls.filter((call) => Number(call.order?.stage ?? 1) === stage);
      const firstColumnX = Math.min(...stageCalls.map((call) => call.processMap.x));
      for (const call of stageCalls.filter((item) => item.processMap.x > firstColumnX)) {
        const predecessorRelation = relations.find((relation) => relation.toCallId === call.id);
        const predecessor = predecessorRelation ? callById.get(predecessorRelation.fromCallId) : null;
        if (!predecessor || Number(predecessor.order?.stage ?? 1) !== stage) continue;
        const desiredY = predecessor.processMap.y;
        const overlaps = stageCalls.some((other) => (
          other.id !== call.id
          && other.processMap.x === call.processMap.x
          && desiredY < other.processMap.y + other.processMap.height + ROW_GAP / 2
          && desiredY + call.processMap.height + ROW_GAP / 2 > other.processMap.y
        ));
        if (!overlaps) call.processMap.y = desiredY;
      }
    }
    maxBottom = Math.max(...processCalls.map((call) => call.processMap.y + call.processMap.height));
    const outgoingRelations = new Map();
    const incomingRelations = new Map();
    for (const relation of relations) {
      if (!outgoingRelations.has(relation.fromCallId)) outgoingRelations.set(relation.fromCallId, []);
      if (!incomingRelations.has(relation.toCallId)) incomingRelations.set(relation.toCallId, []);
      outgoingRelations.get(relation.fromCallId).push(relation);
      incomingRelations.get(relation.toCallId).push(relation);
    }
    const relationOrder = (endpointKey) => (left, right) => {
      const leftCall = callById.get(left[endpointKey]);
      const rightCall = callById.get(right[endpointKey]);
      return Number(leftCall?.displayStep ?? leftCall?.order?.step ?? 0)
        - Number(rightCall?.displayStep ?? rightCall?.order?.step ?? 0);
    };
    for (const group of outgoingRelations.values()) {
      group.sort(relationOrder("toCallId"));
      group.forEach((relation, index) => {
        relation.sourceChannelIndex = index;
        relation.sourceChannelCount = group.length;
      });
    }
    for (const group of incomingRelations.values()) {
      group.sort(relationOrder("fromCallId"));
      group.forEach((relation, index) => {
        relation.targetChannelIndex = index;
        relation.targetChannelCount = group.length;
      });
    }
    for (const relation of relations) {
      const from = callById.get(relation.fromCallId);
      const to = callById.get(relation.toCallId);
      const fromStep = from?.displayStep ?? from?.order?.step;
      const toStep = to?.displayStep ?? to?.order?.step;
      if (relation.kind === "registry_context") {
        const boundaryCall = from?.isRegistryBoundary ? from : to;
        const codeBacked = boundaryCall?.registryBoundary?.evidenceStatus === "code_boundary_and_registry";
        relation.routeLabel = from?.isRegistryBoundary
          ? `Excel → вход процесса`
          : codeBacked
            ? "граница найдена · порядок отдельно"
            : "ожидаемая граница · порядок отдельно";
        relation.routeLabelWidth = Math.max(94, relation.routeLabel.length * 6 + 12);
        relation.showRouteLabel = false;
      } else {
        relation.routeLabel = `${fromStep ?? "?"}→${toStep ?? "?"}`;
        relation.routeLabelWidth = 42;
        relation.showRouteLabel = Number.isFinite(Number(fromStep))
          && Number.isFinite(Number(toStep));
      }
    }
    const executionRelations = relations.filter((relation) => relation.kind !== "registry_context");
    const incoming = new Set(executionRelations.map((relation) => relation.toCallId));
    const outgoing = new Set(executionRelations.map((relation) => relation.fromCallId));
    const inboundRegistryCalls = registryCalls.filter((call) => call.registryBoundary?.direction === "inbound");
    const codeRoots = codeCalls.filter((call) => !incoming.has(call.id));
    const roots = inboundRegistryCalls.length ? inboundRegistryCalls : codeRoots;
    const leaves = codeCalls.filter((call) => !outgoing.has(call.id));
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
      const baseX = hostStage && region.kind === "exception"
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
        ? region.arms.map((arm) => ({
          label: arm.label === "else"
            ? "иначе"
            : `если ${compactCondition(region.condition, 58)}`,
          nodeIds: arm.nodeIds || [],
        }))
        : region.tasks?.length
          ? region.tasks.map((task) => ({ label: task.label || task.taskId || "задача", nodeIds: task.nodeIds || [] }))
          : region.nodeIds?.length
            ? [{ label: region.kind === "exception" ? "обработчик ошибки" : "управляемый участок", nodeIds: region.nodeIds }]
            : [];
      const renderGateway = ["choice", "parallel", "loop"].includes(region.kind);
      const links = (renderGateway ? groups : []).map((group, index) => {
        const target = group.nodeIds.map((nodeId) => callByNodeId.get(nodeId)).find(Boolean);
        return target ? { label: group.label, targetCallId: target.id, index, count: groups.length } : null;
      }).filter(Boolean);
      regions.push({
        ...region,
        id: region.regionId || `process-region-${regions.length + 1}`,
        label: regionLabel(region.kind),
        scopeLabel: regionScope(region.kind),
        symbol: regionSymbol(region.kind),
        renderGateway,
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
            ? "Асинхронный подпроцесс · отдельный контекст выполнения"
            : region.kind === "parallel"
              ? "Параллельный блок · порядок завершения ветвей не задан"
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
      x: Math.min(width - 48, call.processMap.x + call.processMap.width + 64),
      y: call.processMap.y + call.processMap.height / 2,
      kind: call.flowKind === "exception" ? "exception_end" : "end",
      label: call.flowKind === "exception"
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
        x: endPoints.length ? Math.max(...endPoints.map((point) => point.x)) : width - 48,
        y: avgY(leaves),
        sourceCallIds: leaves.map((call) => call.id),
        points: endPoints,
      },
      runtimeTraceSafe: processIr.runtimeTraceSafe !== false,
      unsequencedCount: Number(processIr.summary?.unsequencedNodeCount || 0),
    };
  }

  function edgeRoute(from, to, relation = {}) {
    const sameStage = Number(from.order?.stage ?? 1) === Number(to.order?.stage ?? 1);
    const sameColumn = Math.abs(from.processMap.x - to.processMap.x) < 2;
    const verticalGap = to.processMap.y - (from.processMap.y + from.processMap.height);
    if (sameStage && sameColumn && verticalGap >= 0 && verticalGap <= ROW_GAP * 2) {
      const x = from.processMap.x + from.processMap.width / 2;
      const y1 = from.processMap.y + from.processMap.height;
      const y2 = to.processMap.y;
      return {
        path: `M ${x} ${y1} V ${y2}`,
        labelX: x + 8,
        labelY: y1 + (y2 - y1) / 2 - 4,
        startX: x,
        startY: y1,
        endX: x,
        endY: y2,
      };
    }
    const sourceCount = Math.max(1, Number(relation.sourceChannelCount || 1));
    const sourceIndex = Math.max(0, Number(relation.sourceChannelIndex || 0));
    const targetCount = Math.max(1, Number(relation.targetChannelCount || 1));
    const targetIndex = Math.max(0, Number(relation.targetChannelIndex || 0));
    const x1 = from.processMap.x + from.processMap.width;
    const y1 = from.processMap.y + from.processMap.height * ((sourceIndex + 1) / (sourceCount + 1));
    const x2 = to.processMap.x;
    const y2 = to.processMap.y + to.processMap.height * ((targetIndex + 1) / (targetCount + 1));
    const labelWidth = Math.max(1, Number(relation.routeLabelWidth || 47));
    if (x2 > x1 + 46) {
      const available = x2 - x1;
      const middle = sourceCount > 1
        ? x1 + Math.min(available - 24, 28 + sourceIndex * 34)
        : x1 + available / 2;
      return {
        path: `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`,
        labelX: Math.max(x1 + 8, x2 - labelWidth - 12),
        labelY: y2 - 8,
        startX: x1,
        startY: y1,
        endX: x2,
        endY: y2,
      };
    }
    const lane = Math.max(from.processMap.y + from.processMap.height, to.processMap.y + to.processMap.height)
      + 22 + sourceIndex * 20;
    return {
      path: `M ${x1} ${y1} H ${x1 + 34} V ${lane} H ${x2 - 34} V ${y2} H ${x2}`,
      labelX: x1 + (x2 - x1) / 2,
      labelY: lane - 7,
      startX: x1,
      startY: y1,
      endX: x2,
      endY: y2,
    };
  }

  function edgePath(from, to, relation = {}) {
    return edgeRoute(from, to, relation).path;
  }

  function controlRoute(region, target, link = {}) {
    const x1 = region.x + 25;
    const y1 = region.y + 25;
    const x2 = target.processMap.x;
    const y2 = target.processMap.y + 24 + Number(link.index || 0) * 12;
    const bendX = Math.max(x1 + 28, x2 - 42 - Number(link.index || 0) * 18);
    const labelWidth = Math.max(1, Number(link.labelWidth || 54));
    return {
      path: `M ${x1} ${y1} H ${bendX} V ${y2} H ${x2}`,
      labelX: Math.max(24, Math.min(bendX - 8, x2 - 12) - labelWidth),
      labelY: Math.max(18, target.processMap.y - 8),
    };
  }

  function controlPath(region, target, link = {}) {
    return controlRoute(region, target, link).path;
  }

  global.AIProfilerProcessMap = {
    build,
    edgeRoute,
    edgePath,
    controlRoute,
    controlPath,
    regionLabel,
    regionScope,
    relationLabel,
  };
})(window);
