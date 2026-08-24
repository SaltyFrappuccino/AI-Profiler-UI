window.AIProfilerSequence = (() => {
  const requestTokens = new Set(["request", "rq", "requestdata", "input", "query", "in"]);
  const responseTokens = new Set(["response", "rs", "result", "results", "answer", "output", "out"]);
  const weakResponseTokens = new Set(["decision", "status"]);
  const norm = (value) => String(value || "").replace(/[^a-z0-9]+/gi, "").toLowerCase();

  function payloadDirection(payload, contracts) {
    const tokens = new Set();
    for (const token of String(payload || "").match(/[A-Z]?[a-z0-9]+/g) || []) tokens.add(norm(token));
    for (const contract of contracts || []) {
      for (const field of contract.fieldNames || []) tokens.add(norm(field));
      for (const field of contract.sourceContractFields || []) tokens.add(norm(String(field).split(".", 1)[0]));
      for (const field of contract.targetContractFields || []) tokens.add(norm(String(field).split(".", 1)[0]));
    }
    const hasRq = [...tokens].some((token) => requestTokens.has(token));
    const hasRs = [...tokens].some((token) => responseTokens.has(token));
    const hasWeakRs = [...tokens].some((token) => weakResponseTokens.has(token));
    if (hasRq && hasRs) return "rq+rs";
    if (hasRs || hasWeakRs) return "response";
    if (hasRq) return "request";
    return "unknown";
  }

  function responseEvidence(call, allCalls) {
    if (!call) return { kind: "unknown", label: "нет данных", detail: "" };
    if (call.responseSemantics?.kind) {
      const semantic = call.responseSemantics;
      const uiKinds = {
        synchronous_http_response: "synchronous",
        synchronous_rpc_response: "synchronous",
        synchronous_message_response: "synchronous",
        synchronous_query_response: "synchronous",
        same_payload_rq_rs: "same_model",
        reverse_contract: "reverse",
        pipeline_continuation: "pipeline",
        response_event: "response_event",
        request_event_no_response_proof: "missing",
      };
      const labels = {
        synchronous_http_response: "синхронный HTTP response доказан",
        synchronous_rpc_response: "синхронный gRPC response доказан",
        synchronous_message_response: "синхронный messaging response доказан",
        synchronous_query_response: "синхронный query response доказан",
        same_payload_rq_rs: "request + response в одной модели",
        reverse_contract: "найден обратный контракт",
        pipeline_continuation: "ответ уходит дальше по конвейеру",
        response_event: "это response-событие",
        request_event_no_response_proof: "ответ не доказан",
      };
      const evidence = (semantic.evidence || []).map((item) => item.kind || "").filter(Boolean).slice(0, 4).join(", ");
      return {
        kind: uiKinds[semantic.kind] || semantic.kind,
        label: labels[semantic.kind] || semantic.kind,
        detail: [semantic.detail, evidence ? `Evidence: ${evidence}` : ""].filter(Boolean).join(" "),
      };
    }
    if (call.direction === "rq+rs") {
      return {
        kind: "same_model",
        label: "request + response в одной модели",
        detail: `${call.payload} содержит признаки request и response, поэтому отдельной обратной стрелки может не быть.`,
      };
    }
    const reverse = allCalls.find((item) => item.sourceService === call.targetService && item.targetService === call.sourceService);
    if (reverse) {
      return {
        kind: "reverse",
        label: "найден обратный вызов",
        detail: `${reverse.sourceLabel} -> ${reverse.targetLabel}: ${reverse.payload}`,
      };
    }
    const downstream = allCalls.filter((item) => item.sourceService === call.targetService && item.id !== call.id);
    const responseDownstream = downstream.filter((item) => item.direction === "response" || item.direction === "rq+rs");
    if (responseDownstream.length) {
      return {
        kind: "pipeline",
        label: "ответ уходит дальше по конвейеру",
        detail: responseDownstream.slice(0, 4).map((item) => `${item.targetLabel}: ${item.payload}`).join("; "),
      };
    }
    if (call.direction === "response") {
      return {
        kind: "response_event",
        label: "это response-событие",
        detail: "Модель выглядит как результат/статус, поэтому стрелка может быть этапом сборки ответа.",
      };
    }
    return {
      kind: "missing",
      label: "ответ не доказан",
      detail: "В снапшоте нет reverse edge, rq+rs модели или downstream response от target-сервиса.",
    };
  }

  function groupProcessSteps(steps) {
    const grouped = new Map();
    for (const step of steps || []) {
      const key = [
        step.contractId || step.edgeId || "",
        step.sourceService || "",
        step.targetService || "",
      ].join("|");
      const variant = {
        stepId: step.stepId || "",
        rawStep: Number(step.step || 0),
        routeId: step.executionRouteId || "",
        stage: Number(step.stage || 0),
        ordering: step.ordering || "",
        sourceFile: step.sourceFile || "",
        sourceLine: Number(step.terminalLine || step.sourceLine || 0),
        orderPath: step.orderPath || [],
        controlContext: step.controlContext || [],
        inheritedControlContext: step.inheritedControlContext || [],
        executionMode: step.executionMode || "",
        asyncKind: step.asyncKind || "",
        parallelGroup: step.parallelGroup || "",
        conditionalContext: step.conditionalContext || [],
        loopContext: step.loopContext || [],
        exceptionContext: step.exceptionContext || [],
      };
      const current = grouped.get(key);
      if (current) {
        current.variantCount += 1;
        current.occurrenceCount += 1;
        current.routeVariants.push(variant);
        current.rawStepIds.push(step.stepId || "");
        continue;
      }
      grouped.set(key, {
        ...step,
        variantCount: 1,
        occurrenceCount: 1,
        rawStepIds: [step.stepId || ""],
        routeVariants: [variant],
      });
    }
    return [...grouped.values()];
  }

  function routeSignature(call) {
    const routeIds = [...new Set((call.routeVariants || []).map((variant) => variant.routeId).filter(Boolean))].sort();
    return routeIds.length > 1 ? routeIds.join("|") : "";
  }

  function fragmentSemanticTags(calls) {
    const kinds = new Set(calls.flatMap((call) => call.processIr?.regionKinds || []));
    const variants = calls.flatMap((call) => call.routeVariants || []);
    const controlKinds = new Set(variants.flatMap((variant) => [
      ...(variant.controlContext || []),
      ...(variant.inheritedControlContext || []),
      ...(variant.conditionalContext || []),
      ...(variant.loopContext || []),
      ...(variant.exceptionContext || []),
    ]).map((item) => typeof item === "string" ? item : item?.kind || item?.type || "").filter(Boolean));
    const tags = [];
    if (kinds.has("choice") || kinds.has("guard") || variants.some((variant) => (variant.conditionalContext || []).length)) tags.push("opt");
    if (kinds.has("parallel") || kinds.has("async_task") || variants.some((variant) => variant.executionMode === "parallel" || variant.asyncKind || variant.parallelGroup)) tags.push("par");
    if (kinds.has("loop") || variants.some((variant) => (variant.loopContext || []).length) || controlKinds.has("loop")) tags.push("loop");
    if (kinds.has("exception") || variants.some((variant) => (variant.exceptionContext || []).length) || controlKinds.has("exception") || controlKinds.has("catch")) tags.push("break");
    return tags;
  }

  function createRouteFragment(calls, signature, scale) {
    const routeIds = signature.split("|").filter(Boolean);
    const rawSteps = [...new Set(calls.flatMap((call) =>
      (call.routeVariants || []).map((variant) => Number(variant.rawStep || 0)).filter(Boolean)
    ))].sort((left, right) => left - right);
    const variants = routeIds.map((routeId) => {
      const occurrences = calls.flatMap((call) =>
        (call.routeVariants || [])
          .filter((variant) => variant.routeId === routeId)
          .map((variant) => ({
            callId: call.id,
            sourceLabel: call.sourceLabel,
            targetLabel: call.targetLabel,
            rawStep: Number(variant.rawStep || 0),
            ordering: variant.ordering || "",
            sourceFile: variant.sourceFile || "",
            sourceLine: Number(variant.sourceLine || 0),
            orderPath: variant.orderPath || [],
            controlContext: variant.controlContext || [],
            inheritedControlContext: variant.inheritedControlContext || [],
            conditionalContext: variant.conditionalContext || [],
            loopContext: variant.loopContext || [],
            exceptionContext: variant.exceptionContext || [],
          }))
      );
      return {
        routeId,
        rawSteps: occurrences.map((item) => item.rawStep).filter(Boolean).sort((left, right) => left - right),
        occurrences,
      };
    });
    const minX = Math.min(...calls.flatMap((call) => [call.x1, call.x2]));
    const maxX = Math.max(...calls.flatMap((call) => [call.x1, call.x2]));
    const minY = Math.min(...calls.map((call) => call.y));
    const maxY = Math.max(...calls.map((call) => call.y));
    const processId = calls[0]?.order?.processId || "process";
    return {
      id: `ref:${processId}:${calls[0]?.id || "start"}:${routeIds.join(",")}`,
      kind: "ref",
      routeCount: routeIds.length,
      routeIds,
      variants,
      callIds: calls.map((call) => call.id),
      rawSteps,
      rawStepMin: rawSteps[0] || 0,
      rawStepMax: rawSteps.at(-1) || 0,
      hiddenOccurrenceCount: Math.max(0, calls.reduce((sum, call) => sum + Number(call.variantCount || 1), 0) - calls.length),
      semanticTags: fragmentSemanticTags(calls),
      x: Math.max(8 * scale, minX - 34 * scale),
      y: Math.max(72 * scale, minY - 44 * scale),
      width: Math.max(180 * scale, maxX - minX + 68 * scale),
      height: Math.max(96 * scale, maxY - minY + 92 * scale),
    };
  }

  function buildRouteFragments(calls, scale = 1) {
    const fragments = [];
    let start = 0;
    while (start < (calls || []).length) {
      const signature = routeSignature(calls[start]);
      if (!signature) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (
        end < calls.length
        && routeSignature(calls[end]) === signature
        && calls[end]?.order?.processId === calls[start]?.order?.processId
      ) end += 1;
      if (end - start >= 2) fragments.push(createRouteFragment(calls.slice(start, end), signature, scale));
      start = end;
    }
    return fragments;
  }

  return { payloadDirection, responseEvidence, groupProcessSteps, buildRouteFragments };
})();
