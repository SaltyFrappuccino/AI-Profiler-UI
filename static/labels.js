(function initLabels(global) {
  function transport(transport) {
    const value = String(transport || "");
    if (value.includes("kafka")) return "сообщение Kafka";
    if (value.includes("jms")) return "сообщение JMS";
    if (value.includes("rabbit")) return "сообщение RabbitMQ";
    if (value.includes("grpc")) return "вызов gRPC";
    if (value.includes("http")) return "синхронный HTTP";
    return transport || "?";
  }

  function contractProof(value) {
    return {
      exact_contract: "точное совпадение модели и полей",
      strong_contract: "сильное совпадение контракта",
      field_contract: "совпадение по полям",
      schema_alias_field_contract: "схемы связаны по полям и вариантам имени",
      route_inferred: "получатель выведен из маршрута",
      candidate: "возможная связь",
      partial: "частичное доказательство",
    }[value] || value || "—";
  }

  function qualityTier(value) {
    return {
      verified_contract: "проверенная связь с моделью",
      verified_transport: "проверенный адрес или канал",
      candidate: "требует проверки",
      ambiguous: "несколько равных получателей",
    }[value] || contractProof(value);
  }

  function responseProof(value) {
    return {
      synchronous_http_response: "синхронный HTTP-ответ",
      synchronous_query_response: "синхронный ответ",
      reverse_contract: "доказан встречный канал",
      same_payload_rq_rs: "запрос и ответ находятся в одной модели",
      request_event_no_response_proof: "ответ не доказан",
      missing: "ответ не доказан",
    }[value] || value || "—";
  }

  function responseExplanation(call, compatibility) {
    if (call.responseSemantics?.isSynchronous && compatibility?.status === "body_not_consumed") {
      return "Вызов синхронный: клиент дожидается завершения и видит HTTP-статус, но код намеренно отбрасывает тело ответа.";
    }
    if (call.responseSemantics?.isSynchronous && compatibility?.status === "exact") {
      return "Клиент делает синхронный вызов, получатель подтверждён, а модели ответа с обеих сторон совпадают.";
    }
    if (call.responseSemantics?.isSynchronous && compatibility?.status === "serialized_document") {
      const usage = call.responseUsageEvidence || call.contract?.responseUsageEvidence || {};
      return usage.status === "parsed_and_consumed"
        ? "Ответ вернулся как сериализованный документ, затем код клиента его разобрал и передал дальше. Поля wire-модели известны, но использование каждого поля по отдельности пока не доказано."
        : "Ответ вернулся как сериализованный документ. Поля wire-модели известны, но клиентский DTO и использование отдельных полей пока не доказаны.";
    }
    if (call.responseSemantics?.isSynchronous) {
      return "Ответ возвращается вызывающему по тому же синхронному каналу; совместимость модели показана выше.";
    }
    if (call.responseSemantics?.kind === "reverse_contract") return "Возврат подтверждён отдельным встречным каналом.";
    return "Возврат ответа вызывающему для этого перехода не доказан.";
  }

  function direction(value) {
    return { "rq+rs": "запрос + ответ", request: "запрос", response: "ответ", unknown: "не определено" }[value]
      || value || "—";
  }

  function claimStatus(value) {
    return { proven: "доказано", partial: "доказано частично", candidate: "требует проверки", ambiguous: "неоднозначно" }[value]
      || value || "—";
  }

  function readinessStatus(value) {
    return {
      architecture_ready: "готово для архитектурного просмотра",
      usable_with_gaps: "можно использовать с оговорками",
      review_required: "нужна проверка",
    }[value] || value || "—";
  }

  function orderReason(value) {
    const match = String(value || "").match(/^AST call path from (.+?) reaches (.+?) at (.+?); transport handoff targets (.+)\.$/);
    if (!match) return value;
    return `Из точки входа ${match[1]} код доходит до исходящего вызова ${match[2]} (${match[3]}), затем данные передаются в ${match[4]}.`;
  }

  global.AIProfilerLabels = {
    claimStatus,
    contractProof,
    direction,
    orderReason,
    qualityTier,
    readinessStatus,
    responseExplanation,
    responseProof,
    transport,
  };
})(window);
