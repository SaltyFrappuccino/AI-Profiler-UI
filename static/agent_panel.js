(function initAgentPanel(global) {
  function create({ state, getElement, request, esc, fmt, fitDiagram }) {
    function setTab(tab) {
      const next = tab === "agent" ? "agent" : "detail";
      state.agent.tab = next;
      const detail = getElement("sequence-detail");
      const agent = getElement("process-agent");
      const detailTab = getElement("inspector-tab-detail");
      const agentTab = getElement("inspector-tab-agent");
      if (detail) detail.hidden = next !== "detail";
      if (agent) agent.hidden = next !== "agent";
      detailTab?.classList.toggle("active", next === "detail");
      agentTab?.classList.toggle("active", next === "agent");
      detailTab?.setAttribute("aria-selected", next === "detail" ? "true" : "false");
      agentTab?.setAttribute("aria-selected", next === "agent" ? "true" : "false");
      getElement("seq-agent")?.classList.toggle("active", next === "agent");
    }

    function setCollapsed(collapsed) {
      state.agent.collapsed = Boolean(collapsed);
      const layout = document.querySelector(".sequence-layout");
      const button = getElement("inspector-collapse");
      layout?.classList.toggle("inspector-collapsed", state.agent.collapsed);
      if (button) {
        button.textContent = state.agent.collapsed ? "‹" : "›";
        button.title = state.agent.collapsed ? "Развернуть инспектор" : "Свернуть инспектор";
        button.setAttribute("aria-label", button.title);
      }
      requestAnimationFrame(() => fitDiagram({ readable: true }));
    }

    function selectedContext() {
      const process = state.sequence.processId
        ? (state.graph?.processes || []).find((item) => item.processId === state.sequence.processId)
        : null;
      const mapCall = state.sequence.processMapData?.callById?.get(state.sequence.selectedId) || null;
      const call = mapCall
        || state.sequence.data?.calls?.find((item) => item.id === state.sequence.selectedId)
        || null;
      return {
        process,
        call,
        processId: process?.processId || "",
        contractId: call?.isBridge ? "" : (call?.contractId || ""),
        stage: state.sequence.selectedStage || Number(call?.order?.stage || 0) || null,
      };
    }

    function updateContext() {
      const label = getElement("agent-context");
      if (!label) return;
      const { process, call, stage } = selectedContext();
      label.textContent = [
        process?.name || "весь снимок",
        stage ? `этап ${stage}` : "",
        call ? `${call.sourceLabel} → ${call.targetLabel}` : "",
      ].filter(Boolean).join(" · ");
    }

    function citationHref(citation) {
      if (citation.contractId && state.snapshot?.id) {
        const params = new URLSearchParams({
          view: "mappings",
          snapshot: state.snapshot.id,
          mapping: citation.contractId,
        });
        return `${window.location.pathname}?${params.toString()}`;
      }
      const artifact = String(citation.artifact || "");
      if (!artifact) return "";
      if (artifact.startsWith("/")) return artifact;
      return `/file?path=${encodeURIComponent(artifact)}`;
    }

    function renderStageBrief(brief) {
      const metrics = (brief.metrics || []).map((item) => `
        <div class="agent-stage-metric"><b>${fmt(item.value)}</b><span>${esc(item.label)}</span></div>`).join("");
      const actions = (brief.actions || []).map((action) => {
        const details = [
          action.operation ? `метод ${action.operation}` : "",
          action.transport,
          action.payload ? `модель ${action.payload}` : "",
          action.ordering,
        ].filter(Boolean).map((item) => `<span>${esc(item)}</span>`).join("");
        return `<article class="agent-stage-action ${action.proven ? "proven" : "limited"}">
          <div class="agent-stage-action-head">
            <b>${esc(action.title)}</b>
            ${action.variantCount > 1 ? `<span class="badge info">${fmt(action.variantCount)} варианта</span>` : ""}
          </div>
          <div class="agent-stage-action-meta">${details}</div>
          <p>${esc(action.response)}</p>
          <div class="agent-stage-action-foot">
            <span>Связи полей: ${fmt(action.fieldLinkCount)}</span>
            ${action.readiness != null ? `<span>готовность ${fmt(action.readiness)}/100</span>` : ""}
          </div>
        </article>`;
      }).join("");
      const evidence = (brief.evidence || []).map((item) => `<li>${esc(item)}</li>`).join("");
      const limitations = (brief.limitations || []).map((item) => `<li>${esc(item)}</li>`).join("");
      return `<section class="agent-stage-brief">
        <h3>${esc(brief.title)}</h3>
        <p class="agent-stage-summary">${esc(brief.summary)}</p>
        <div class="agent-stage-metrics">${metrics}</div>
        <h4>Действия этапа</h4>
        <div class="agent-stage-actions">${actions}</div>
        <div class="agent-stage-findings">
          <section><h4>Что подтверждено</h4><ul>${evidence}</ul></section>
          ${limitations ? `<section class="limitations"><h4>Что пока нельзя утверждать</h4><ul>${limitations}</ul></section>` : ""}
        </div>
      </section>`;
    }

    function renderConversation() {
      const host = getElement("agent-conversation");
      if (!host) return;
      if (!state.agent.history.length) {
        host.innerHTML = `<div class="agent-empty">Ответ строится только по выбранному снимку. GigaChat формулирует текст, но не добавляет факты без ссылок.</div>`;
        return;
      }
      host.innerHTML = state.agent.history.map((entry) => {
        const citations = (entry.response?.citations || []).slice(0, 18).map((citation) => {
          const href = citationHref(citation);
          const label = `${citation.type || "fact"}: ${citation.label || citation.id || "факт"}`;
          return `<li>${href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)}${citation.sourceFile ? ` · ${esc(citation.sourceFile)}${citation.sourceLine ? `:${fmt(citation.sourceLine)}` : ""}` : ""}</li>`;
        }).join("");
        const stageBrief = entry.response?.stageBrief ? renderStageBrief(entry.response.stageBrief) : "";
        const answer = stageBrief
          ? `<div class="agent-answer agent-synthesis"><b>Ответ GigaChat</b>${esc(entry.response?.answer || "Ответ модели не получен")}</div>`
          : `<div class="agent-answer">${esc(entry.response?.answer || "Ответ не получен")}</div>`;
        return `<article class="agent-message">
          <div class="question">${esc(entry.question)}</div>
          <div class="agent-answer-head"><b>GigaChat</b><span>${fmt(entry.response?.citations?.length || 0)} оснований</span></div>
          ${entry.response?.llmHint ? `<div class="agent-warning">${esc(entry.response.llmHint)}</div>` : ""}
          ${stageBrief}
          ${answer}
          ${citations ? `<details class="ai-evidence"><summary>Проверяемые основания</summary><ul class="agent-citations">${citations}</ul></details>` : `<div class="agent-warning">В ответе нет адресных оснований. Используйте его только как указатель на пробел.</div>`}
        </article>`;
      }).join("");
      const latest = host.lastElementChild;
      host.scrollTop = latest ? Math.max(0, latest.offsetTop - host.offsetTop) : 0;
    }

    async function ask(question) {
      const text = String(question || "").trim();
      if (!text || state.agent.loading || !state.snapshot?.id) return;
      const context = selectedContext();
      state.agent.loading = true;
      const submit = getElement("agent-submit");
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Спрашиваю GigaChat…";
      }
      try {
        const response = await request("/api/agent/ask", {
          method: "POST",
          body: JSON.stringify({
            snapshotId: state.snapshot.id,
            question: text,
            mode: "llm",
            processId: context.processId,
            contractId: context.contractId,
            stage: context.stage,
          }),
        });
        state.agent.history.push({ question: text, response });
        state.agent.history = state.agent.history.slice(-8);
        const input = getElement("agent-question");
        if (input) input.value = "";
        renderConversation();
      } catch (error) {
        state.agent.history.push({
          question: text,
          response: { answer: `Не удалось получить ответ GigaChat: ${error.message}`, citations: [], mode: "llm" },
        });
        renderConversation();
      } finally {
        state.agent.loading = false;
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Спросить";
        }
      }
    }

    return {
      ask,
      citationHref,
      renderConversation,
      renderStageBrief,
      selectedContext,
      setCollapsed,
      setTab,
      updateContext,
    };
  }

  global.AIProfilerAgentPanel = { create };
})(globalThis);
