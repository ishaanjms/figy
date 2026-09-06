const chatToggle = document.getElementById("chatToggle");
const chatPanel = document.getElementById("chatPanel");
const chatClose = document.getElementById("chatClose");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatWelcomeMessage = "Hi, I can help you brainstorm, summarize ideas, or turn rough sticky notes into cleaner wording.";
let chatHistory = [
  { role: "assistant", content: chatWelcomeMessage }
];

function setChatOpen(isOpen) {
  chatPanel.classList.toggle("open", isOpen);
  chatPanel.setAttribute("aria-hidden", String(!isOpen));
  chatToggle.setAttribute("aria-expanded", String(isOpen));

  if (isOpen) {
    chatInput.focus();
  }
}

function renderChatMessages() {
  chatMessages.innerHTML = "";

  chatHistory.forEach((message, index) => {
    const messageElement = document.createElement("div");
    messageElement.className = "chat-message " + message.role;

    if (message.role === "assistant") {
      messageElement.innerHTML = renderMarkdown(getAssistantDisplayContent(message.content, index));
      appendAssistantActions(messageElement, message, index);
    } else {
      messageElement.textContent = message.content;
    }

    chatMessages.appendChild(messageElement);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendAssistantActions(messageElement, message, index) {
  if (index === 0 || isNonIdeaAssistantMessage(message.content) || !window.FigyBoard) return;

  const ideas = extractIdeasFromAIResponse(message.content);
  const cleanText = getPlainAIText(message.content);
  const sourcePrompt = getPreviousUserMessage(index);
  const canCreateFlowchart = isFlowchartRequest(sourcePrompt + "\n" + message.content);

  if (!ideas.length && !cleanText && !canCreateFlowchart) return;

  const actions = document.createElement("div");
  actions.className = "chat-actions";

  if (canCreateFlowchart) {
    actions.appendChild(createChatAction("Add flowchart", async () => {
      markActionUsed(actions, "Building flowchart...");
      const plan = await generateFlowchartPlan(sourcePrompt, message.content);

      window.FigyBoard.addAIFlowchart(plan);
      markActionUsed(actions, "Added flowchart");
    }));
    actions.dataset.messageIndex = index;
    messageElement.appendChild(actions);
    return;
  }

  if (ideas.length) {
    actions.appendChild(createChatAction("Add stickies", () => {
      window.FigyBoard.addAIStickies(ideas);
      markActionUsed(actions, "Added stickies");
    }));
  }

  if (cleanText) {
    actions.appendChild(createChatAction("Add text", () => {
      window.FigyBoard.addAIText(cleanText);
      markActionUsed(actions, "Added text");
    }));
  }

  const heading = getAIHeading(message.content);

  if (heading) {
    actions.appendChild(createChatAction("Add heading", () => {
      window.FigyBoard.addAIText(heading, { heading: true });
      markActionUsed(actions, "Added heading");
    }));
  }

  actions.dataset.messageIndex = index;
  messageElement.appendChild(actions);
}

function isNonIdeaAssistantMessage(content) {
  return (
    content === "Thinking..." ||
    content.startsWith("The Figy chat server") ||
    content.startsWith("Start the Figy chat server") ||
    content.startsWith("Add your Hugging Face API key")
  );
}

function createChatAction(label, onClick) {
  const button = document.createElement("button");

  button.type = "button";
  button.innerText = label;
  button.addEventListener("click", async () => {
    button.disabled = true;

    try {
      await onClick();
    } catch (error) {
      const actions = button.closest(".chat-actions");
      markActionUsed(actions, error?.message || "Could not add this");
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function markActionUsed(actions, label) {
  if (!actions) return;

  actions.querySelector(".chat-action-status")?.remove();

  const status = document.createElement("span");

  status.className = "chat-action-status";
  status.innerText = label;
  actions.appendChild(status);
}

function getAssistantDisplayContent(content, index = -1) {
  const jsonPlan = parseFlowchartPlan(content);
  if (isUsableFlowchartPlan(jsonPlan)) return formatFlowchartDisplay(normalizeChatFlowchartPlan(jsonPlan));

  if (isJsonLikeFlowchartText(content)) {
    return [
      "**Flowchart plan**",
      "",
      "I received a structured plan, but it needs to be cleaned before it can be rendered on the board."
    ].join("\n");
  }

  const mermaidPlan = parseMermaidFlowchart(content);
  if (mermaidPlan.nodes.length) return formatFlowchartDisplay(mermaidPlan);

  const asciiPlan = parseAsciiBoxFlowchart(content);
  if (asciiPlan.nodes.length) return formatFlowchartDisplay(asciiPlan);

  const bracketPlan = parseBracketFlowchart(content);
  const displayPlan = bracketPlan.nodes.length ? bracketPlan : { nodes: [] };

  if (!displayPlan.nodes.length) {
    const sourcePrompt = getPreviousUserMessage(index);

    if (isFlowchartRequest(sourcePrompt + "\n" + content)) {
      return [
        "**Flowchart plan**",
        "",
        "I can turn this into an editable flowchart with steps, branches, and connectors on the board."
      ].join("\n");
    }

    return content;
  }

  return formatFlowchartDisplay(displayPlan);
}

function formatFlowchartDisplay(displayPlan) {
  const title = displayPlan.title || "Flowchart plan";
  const steps = displayPlan.nodes.slice(0, 8).map((node, index) => {
    const detail = node.detail ? " - " + node.detail : "";

    return `${index + 1}. ${node.label}${detail}`;
  });
  const moreText = displayPlan.nodes.length > steps.length ? `\n\nPlus ${displayPlan.nodes.length - steps.length} more step${displayPlan.nodes.length - steps.length === 1 ? "" : "s"} in the generated board.` : "";

  return [
    `**${title}**`,
    "",
    "I found a structured flow with branches where needed:",
    "",
    ...steps,
    moreText
  ].join("\n");
}

function getPreviousUserMessage(index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (chatHistory[i]?.role === "user") return chatHistory[i].content;
  }

  return "";
}

function isFlowchartRequest(content) {
  return isMermaidFlowchartCode(content) || /\b(flow\s*chart|flowchart|workflow|process|pipeline|journey|decision tree|steps|sequence|diagram|map out|system flow)\b/i.test(content);
}

function isMermaidFlowchartCode(content) {
  const text = normalizeAssistantText(content);

  return /(^|\n)\s*(flowchart|graph)\s+(td|tb|bt|lr|rl)\b/i.test(text) ||
    /(^|\n)\s*[A-Za-z][\w-]*\s*(?:\[\[?[^\]]+\]?\]|\{[^}]+\}|\(\([^)]+\)\)|\([^)]+\))?\s*(?:-->|---|==>|-.->|--\s*[^-\n]+?\s*-->|==\s*[^=\n]+?\s*==>)/i.test(text);
}

async function generateFlowchartPlan(userPrompt, assistantReply) {
  const userMermaidPlan = parseMermaidFlowchart(userPrompt, userPrompt);

  if (userMermaidPlan.nodes.length) return userMermaidPlan;

  const reply = await window.FigyAI.requestAIReply([
    {
      role: "user",
      content: [
        "You are Figy's internal agentic flowchart builder. Produce a high-quality editable whiteboard plan.",
        "",
        "Think as three agents, but output only the final JSON:",
        "1. Process analyst: infer the missing practical steps from the user's goal. Do not require the user to provide every detail.",
        "2. Branch planner: identify real choices, alternatives, exceptions, and optional paths.",
        "3. Board executor: convert the plan into nodes and directed connections for a FigJam-style canvas.",
        "",
        "Return only valid minified JSON. No markdown fences, no Mermaid, no ASCII art, no prose.",
        "Schema:",
        "{\"title\":\"Short title\",\"nodes\":[{\"id\":\"stable-id\",\"type\":\"start|step|decision|end\",\"label\":\"User-facing label\",\"detail\":\"Optional detail\",\"row\":0,\"column\":0}],\"connections\":[{\"from\":\"stable-id\",\"to\":\"stable-id\",\"label\":\"Optional choice label\"}]}",
        "",
        "Quality rules:",
        "- Build the complete useful process, not a tiny summary.",
        "- Use 6 to 14 nodes for ordinary processes.",
        "- Use decision nodes for meaningful branches such as options, yes/no checks, failures, or alternatives.",
        "- A decision node must have at least two outgoing connections with different labels.",
        "- Branches may rejoin later when the process converges.",
        "- Include row and column numbers. Top-to-bottom flow increases row. Put alternative branches in different columns.",
        "- Keep node labels human readable. Never use internal ids, arrows, brackets, numbering, Mermaid syntax, or words like ASCII.",
        "- Keep labels under 46 characters. Keep details under 120 characters.",
        "- Put choice names on connection.label, not inside the decision label.",
        "- Do not create separate nodes for simple ingredient lists unless they are actual process steps.",
        "- Prefer a useful real-world flow over a strictly linear list.",
        "",
        "User request:",
        userPrompt || "Create a useful process flowchart.",
        "",
        "Context from the previous assistant reply, if useful. Ignore its formatting and diagrams:",
        assistantReply
      ].join("\n")
    }
  ], { maxTokens: 2400 });
  const parsedPlan = parseFlowchartPlan(reply);

  if (isUsableFlowchartPlan(parsedPlan)) return normalizeChatFlowchartPlan(parsedPlan, userPrompt);

  if (isJsonLikeFlowchartText(reply)) {
    throw new Error("The AI returned an incomplete flowchart plan. Try again, or paste Mermaid code directly.");
  }

  const replyAsciiFlowPlan = parseAsciiBoxFlowchart(reply, userPrompt);

  if (replyAsciiFlowPlan.nodes.length) return replyAsciiFlowPlan;

  const replyBracketFlowPlan = parseBracketFlowchart(reply, userPrompt);

  if (replyBracketFlowPlan.nodes.length) return replyBracketFlowPlan;

  const replyMermaidPlan = parseMermaidFlowchart(reply, userPrompt);

  if (replyMermaidPlan.nodes.length) return replyMermaidPlan;

  const mermaidPlan = parseMermaidFlowchart(assistantReply, userPrompt);

  if (mermaidPlan.nodes.length) return mermaidPlan;

  const asciiFlowPlan = parseAsciiBoxFlowchart(assistantReply, userPrompt);

  if (asciiFlowPlan.nodes.length) return asciiFlowPlan;

  const bracketFlowPlan = parseBracketFlowchart(assistantReply, userPrompt);

  if (bracketFlowPlan.nodes.length) return bracketFlowPlan;

  const fallbackPlan = createFlowchartPlanFromIdeas(userPrompt, assistantReply);

  if (fallbackPlan.nodes.length) return fallbackPlan;

  throw new Error("Could not find enough steps for a flowchart.");
}

function parseFlowchartPlan(reply) {
  const jsonText = extractJsonObject(reply);

  if (!jsonText) return {};

  try {
    return unwrapFlowchartPlan(JSON.parse(jsonText));
  } catch {
    return {};
  }
}

function unwrapFlowchartPlan(plan) {
  if (!plan || typeof plan !== "object") return {};
  if (Array.isArray(plan.nodes) || Array.isArray(plan.steps)) return plan;
  if (plan.flowchart && typeof plan.flowchart === "object") return unwrapFlowchartPlan(plan.flowchart);
  if (plan.plan && typeof plan.plan === "object") return unwrapFlowchartPlan(plan.plan);
  if (plan.data && typeof plan.data === "object") return unwrapFlowchartPlan(plan.data);

  return plan;
}

function isUsableFlowchartPlan(plan) {
  const nodes = Array.isArray(plan?.nodes) ? plan.nodes : Array.isArray(plan?.steps) ? plan.steps : [];

  return nodes.length >= 2 && nodes.every((node) => {
    const label = cleanIdeaLine(node?.label || node?.title || node?.name || "");

    return label && !isJsonFragmentLabel(label) && !/^[a-z]$/i.test(label);
  });
}

function normalizeChatFlowchartPlan(plan, userPrompt = "") {
  const rawNodes = Array.isArray(plan.nodes) ? plan.nodes : Array.isArray(plan.steps) ? plan.steps : [];
  const nodes = rawNodes.map((node, index) => {
    const label = cleanJsonFlowchartLabel(node.label || node.title || node.name || (index === 0 ? "Start" : "Step " + index));

    return {
      id: cleanFlowchartIdForChat(node.id || label || "step-" + index),
      type: cleanIdeaLine(node.type || node.kind || (index === 0 ? "start" : index === rawNodes.length - 1 ? "end" : "step")).toLowerCase(),
      label,
      detail: cleanIdeaLine(node.detail || node.description || node.note || ""),
      row: Number.isFinite(Number(node.row)) ? Number(node.row) : null,
      column: Number.isFinite(Number(node.column)) ? Number(node.column) : null
    };
  }).filter((node) => node.id && node.label && !isJsonFragmentLabel(node.label));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawConnections = Array.isArray(plan.connections) ? plan.connections : Array.isArray(plan.edges) ? plan.edges : [];
  let connections = rawConnections.map((connection) => ({
    from: cleanFlowchartIdForChat(connection.from || connection.source || connection.start || ""),
    to: cleanFlowchartIdForChat(connection.to || connection.target || connection.end || ""),
    label: cleanIdeaLine(connection.label || connection.choice || connection.condition || "")
  })).filter((connection) => nodeIds.has(connection.from) && nodeIds.has(connection.to) && connection.from !== connection.to);

  if (!connections.length) {
    connections = nodes.slice(0, -1).map((node, index) => ({
      from: node.id,
      to: nodes[index + 1].id,
      label: ""
    }));
  }

  return {
    title: cleanIdeaLine(plan.title || plan.name || userPrompt).slice(0, 80) || "AI Flowchart",
    nodes,
    connections
  };
}

function cleanJsonFlowchartLabel(label) {
  return cleanIdeaLine(label)
    .replace(/^\[([A-Za-z][^\]]{1,80})\]$/, "$1")
    .replace(/^\(([^)]{2,80})\)$/, "$1")
    .trim();
}

function isJsonLikeFlowchartText(text) {
  const normalized = normalizeAssistantText(text);

  return /```json/i.test(normalized) ||
    /^\s*\{/.test(normalized) ||
    /"nodes"\s*:|"steps"\s*:|"connections"\s*:|"edges"\s*:/i.test(normalized);
}

function isJsonFragmentLabel(label) {
  return /^[{}\[\],:]$/.test(label) ||
    /^(json|title|nodes|connections|steps|edges)\s*[{:]?$/i.test(label) ||
    /^["']?(id|type|label|row|column|from|to|source|target)["']?\s*:/.test(label) ||
    /^{?\s*["']?(id|type|label|row|column|from|to|source|target)["']?\s*:/.test(label);
}

function isStrongFlowchartPlan(plan) {
  if (!plan || !Array.isArray(plan.nodes) || !Array.isArray(plan.connections)) return false;
  if (plan.nodes.length < 4) return false;

  const nodeTypes = new Map(plan.nodes.map((node) => [node.id, String(node.type || "").toLowerCase()]));
  const outgoingCounts = plan.connections.reduce((counts, connection) => {
    counts.set(connection.from, (counts.get(connection.from) || 0) + 1);
    return counts;
  }, new Map());

  return plan.nodes.every((node) => {
    const label = cleanIdeaLine(node.label || node.title || node.name || "");

    if (!label || /^[a-z]$/i.test(label) || /-->|ascii|mermaid|^\[?\d+\]?/.test(label.toLowerCase())) return false;
    if (nodeTypes.get(node.id)?.includes("decision")) {
      return (outgoingCounts.get(node.id) || 0) >= 2;
    }

    return true;
  });
}

function parseAsciiBoxFlowchart(text, userPrompt = "") {
  if (isJsonLikeFlowchartText(text)) return { title: "", nodes: [], connections: [] };

  const lines = normalizeAssistantText(text)
    .replace(/```/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const nodes = [];

  lines.forEach((line, index) => {
    if (isAsciiBranchText(line)) return;

    const cellParts = line
      .split("|")
      .map((part) => cleanAsciiFlowText(part))
      .filter(Boolean);
    const label = cellParts.find((part) => (
      isUsefulIdea(part) &&
      !isAsciiDiagramText(part) &&
      !isAsciiTitleText(part) &&
      !/^[-_]+$/.test(part)
    ));

    if (!label) return;

    const rawNextLine = lines[index + 1] || "";
    const nextLine = cleanAsciiFlowText(rawNextLine);
    const detail = nextLine && !isAsciiDiagramText(nextLine) && !isAsciiBranchText(rawNextLine) && !/^\|/.test(rawNextLine) ? nextLine : "";

    nodes.push({
      id: "step-" + (nodes.length + 1),
      type: getAsciiFlowNodeType(label, nodes.length),
      label,
      detail
    });
  });

  const uniqueNodes = uniqueFlowchartNodes(nodes).slice(0, 12);

  if (uniqueNodes.length < 2) return { title: "", nodes: [], connections: [] };

  uniqueNodes[0].type = "start";
  uniqueNodes[uniqueNodes.length - 1].type = "end";

  return {
    title: getFlowchartTitle(text, userPrompt),
    nodes: uniqueNodes,
    connections: uniqueNodes.slice(0, -1).map((node, index) => ({
      from: node.id,
      to: uniqueNodes[index + 1].id
    }))
  };
}

function isAsciiDiagramText(text) {
  return (
    /^[|+\-_\s┌┐└┘─│┬┴┤├]+$/.test(text) ||
    /^[|+\-_\s]+$/.test(text) ||
    /^\|?\s*[-_]{3,}\s*\|?$/.test(text) ||
    /^[▼▲→←↓↑]+$/.test(text) ||
    /^\|?\s*[▼▲→←↓↑]\s*\|?$/.test(text) ||
    /^[-–—]$/.test(text)
  );
}

function isAsciiTitleText(text) {
  return /flow\s*chart|flowchart|ascii|diagram/i.test(text);
}

function isAsciiBranchText(text) {
  return /[├└┬┴─▶→]/.test(text);
}

function cleanAsciiFlowText(text) {
  return cleanIdeaLine(text)
    .replace(/[┌┐└┘│─┬┴┤├]+/g, " ")
    .replace(/[▼▲]/g, " ")
    .replace(/[→←↓↑▶]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAsciiFlowNodeType(label, index) {
  if (/^start$/i.test(label)) return "start";
  if (/^end$|done|finish|enjoy/i.test(label)) return "end";
  if (/\?$|decision|yes|no|choose|if\b/i.test(label)) return "decision";

  return index === 0 ? "start" : "step";
}

function uniqueFlowchartNodes(nodes) {
  const seen = new Set();

  return nodes.filter((node) => {
    const key = node.label.toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function parseBracketFlowchart(text, userPrompt = "") {
  if (isJsonLikeFlowchartText(text)) return { title: "", nodes: [], connections: [] };

  const lines = normalizeAssistantText(text)
    .replace(/```/g, "")
    .split(/\r?\n/)
    .map((line) => cleanIdeaLine(line))
    .filter(Boolean);
  const stepLines = lines.filter((line) => /^\[[^\]]{2,80}\]/.test(line));

  if (stepLines.length < 2) return { title: "", nodes: [], connections: [] };

  const nodes = stepLines.map((line, index) => {
    const label = line.match(/^\[([^\]]+)\]/)?.[1] || line;
    const detail = line.replace(/^\[[^\]]+\]\s*/, "").replace(/^[-–—]\s*/, "");

    return {
      id: "step-" + (index + 1),
      type: index === 0 ? "start" : index === stepLines.length - 1 ? "end" : "step",
      label,
      detail
    };
  });

  return {
    title: getFlowchartTitle(text, userPrompt),
    nodes,
    connections: nodes.slice(0, -1).map((node, index) => ({
      from: node.id,
      to: nodes[index + 1].id
    }))
  };
}

function parseMermaidFlowchart(text, userPrompt = "") {
  if (isJsonLikeFlowchartText(text) && !hasMermaidDirectionLine(text)) return { title: "", nodes: [], connections: [] };

  const rawLines = normalizeAssistantText(text)
    .replace(/```mermaid/gi, "")
    .replace(/```/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const nodes = new Map();
  const connections = [];
  const directionLine = rawLines.find((line) => /^(flowchart|graph)\s+(td|tb|bt|lr|rl)\b/i.test(line));

  rawLines.forEach((line) => {
    if (/^(flowchart|graph)\s+/i.test(line)) return;
    const standaloneNode = readMermaidNode(line, 0);

    if (standaloneNode && standaloneNode.end >= line.replace(/;$/, "").trim().length) {
      upsertMermaidNode(nodes, standaloneNode.node);
      return;
    }

    parseMermaidEdgeChain(line).forEach((edge) => {
      upsertMermaidNode(nodes, edge.fromNode);
      upsertMermaidNode(nodes, edge.toNode);
      connections.push({
        from: edge.fromNode.id,
        to: edge.toNode.id,
        label: edge.label
      });
    });
  });

  if (!connections.length) return { title: "", nodes: [], connections: [] };

  const labeledNodes = [...nodes.values()].filter((node) => node.label && !/^[a-z]$/i.test(node.label));
  const labeledIds = new Set(labeledNodes.map((node) => node.id));

  return {
    title: directionLine ? getFlowchartTitle(text, userPrompt) : "",
    nodes: labeledNodes.slice(0, 80),
    connections: connections
      .filter((connection) => labeledIds.has(connection.from) && labeledIds.has(connection.to))
      .slice(0, 140)
  };
}

function hasMermaidDirectionLine(text) {
  return /(^|\n)\s*(flowchart|graph)\s+(td|tb|bt|lr|rl)\b/i.test(normalizeAssistantText(text));
}

function parseMermaidEdgeChain(line) {
  const edges = [];
  let cursor = 0;
  let currentNode = readMermaidNode(line, cursor);

  if (!currentNode) return edges;

  cursor = currentNode.end;

  while (cursor < line.length) {
    const arrowMatch = line.slice(cursor).match(/^\s*(?:(?:-->|---|==>|-.->)\s*(?:\|([^|]*)\|\s*)?|--\s*([^-]+?)\s*-->|==\s*([^=]+?)\s*==>|-\.\s*([^.]+?)\s*\.->)/);

    if (!arrowMatch) break;

    cursor += arrowMatch[0].length;

    const nextNode = readMermaidNode(line, cursor);

    if (!nextNode) break;

    edges.push({
      fromNode: currentNode.node,
      toNode: nextNode.node,
      label: cleanIdeaLine(arrowMatch[1] || arrowMatch[2] || arrowMatch[3] || arrowMatch[4] || "")
    });
    currentNode = nextNode;
    cursor = nextNode.end;
  }

  return edges;
}

function readMermaidNode(line, startIndex = 0) {
  const source = line.slice(startIndex).trimStart();
  const skipped = line.slice(startIndex).length - source.length;
  const match = source.match(/^([A-Za-z][\w-]*)\s*(?:\[\[([^\]]+)\]\]|\[([^\]]+)\]|\{([^}]+)\}|\(\(([^)]+)\)\)|\(([^)]+)\))?/);

  if (!match) return null;

  return {
    node: createMermaidNodeFromMatch(match),
    end: startIndex + skipped + match[0].length
  };
}

function parseMermaidNodeToken(token) {
  const cleanToken = String(token)
    .trim()
    .replace(/;$/, "")
    .replace(/^\s*&lt;.*?&gt;\s*/, "")
    .replace(/\s*&lt;.*?&gt;\s*$/, "");
  const nodeMatch = cleanToken.match(/^([A-Za-z][\w-]*)\s*(?:\[\[([^\]]+)\]\]|\[([^\]]+)\]|\{([^}]+)\}|\(\(([^)]+)\)\)|\(([^)]+)\))?/);

  if (!nodeMatch) return { id: "", label: "", type: "step" };

  return createMermaidNodeFromMatch(nodeMatch);
}

function createMermaidNodeFromMatch(nodeMatch) {
  const id = cleanFlowchartIdForChat(nodeMatch[1]);
  const hasExplicitLabel = Boolean(nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[5] || nodeMatch[6]);
  const rawLabel = nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[5] || nodeMatch[6] || "";
  const label = cleanMermaidLabel(rawLabel);
  const type = nodeMatch[4] ? "decision" : /start/i.test(label) ? "start" : /end|finish|done/i.test(label) ? "end" : "step";

  return {
    id,
    label: hasExplicitLabel ? label : "",
    detail: "",
    type
  };
}

function cleanMermaidLabel(label) {
  return cleanIdeaLine(label)
    .replace(/^["']|["']$/g, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
}

function upsertMermaidNode(nodes, node) {
  const existingNode = nodes.get(node.id);

  if (!existingNode || !existingNode.label || existingNode.label === existingNode.id) {
    nodes.set(node.id, node);
  }
}

function cleanFlowchartIdForChat(id) {
  return String(id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFlowchartTitle(text, userPrompt = "") {
  const mermaidCommentTitle = String(text).match(/^\s*%%\s*(?:title:\s*)?(.{3,90})$/mi)?.[1];

  if (mermaidCommentTitle) return cleanIdeaLine(mermaidCommentTitle);

  const heading = String(text).match(/^#{1,3}\s+(.{3,90})$/m)?.[1];

  if (heading) return cleanIdeaLine(heading);

  const boldTitle = String(text).match(/\*\*([^*]{3,90})\*\*/)?.[1];

  if (boldTitle && /flow|process|workflow|chart/i.test(boldTitle)) return cleanIdeaLine(boldTitle);

  if (isMermaidFlowchartCode(userPrompt || text)) return "Mermaid Flowchart";

  return cleanIdeaLine(userPrompt).slice(0, 80) || "AI Flowchart";
}

function extractJsonObject(text) {
  const cleanText = String(text)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return "";

  return cleanText.slice(firstBrace, lastBrace + 1);
}

function createFlowchartPlanFromIdeas(userPrompt, assistantReply) {
  const ideas = extractIdeasFromAIResponse(assistantReply).slice(0, 8);
  const title = getAIHeading(assistantReply) || cleanIdeaLine(userPrompt).slice(0, 80) || "AI Flowchart";
  const nodes = ideas.map((idea, index) => ({
    id: "step-" + (index + 1),
    type: index === 0 ? "start" : index === ideas.length - 1 ? "end" : "step",
    label: idea.title,
    detail: idea.detail || ""
  }));

  return {
    title,
    nodes,
    connections: nodes.slice(0, -1).map((node, index) => ({
      from: node.id,
      to: nodes[index + 1].id
    }))
  };
}

function renderMarkdown(markdown) {
  const escaped = escapeHtml(normalizeAssistantText(markdown));
  const lines = escaped.split(/\r?\n/);
  const html = [];
  let listType = null;
  let tableBuffer = [];

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (isMarkdownTableLine(trimmed)) {
      tableBuffer.push(trimmed);
      return;
    }

    flushTable();

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)/);

    if (unorderedMatch || orderedMatch) {
      const nextListType = unorderedMatch ? "ul" : "ol";

      if (listType && listType !== nextListType) {
        html.push("</" + listType + ">");
        listType = null;
      }

      if (!listType) {
        listType = nextListType;
        html.push("<" + listType + ">");
      }

      html.push("<li>" + renderInlineMarkdown((unorderedMatch || orderedMatch)[1]) + "</li>");
      return;
    }

    if (listType) {
      html.push("</" + listType + ">");
      listType = null;
    }

    if (!trimmed) {
      html.push("<br>");
      return;
    }

    html.push("<p>" + renderInlineMarkdown(trimmed) + "</p>");
  });

  flushTable();

  if (listType) html.push("</" + listType + ">");

  return html.join("");

  function flushTable() {
    if (!tableBuffer.length) return;

    const tableRows = tableBuffer.filter((row) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(row));

    if (tableRows.length) {
      html.push("<table>");
      tableRows.forEach((row, index) => {
        const cells = row.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
        const tag = index === 0 ? "th" : "td";
        html.push("<tr>" + cells.map((cell) => "<" + tag + ">" + renderTableCell(cell) + "</" + tag + ">").join("") + "</tr>");
      });
      html.push("</table>");
    }

    tableBuffer = [];
  }
}

function isMarkdownTableLine(line) {
  return line.includes("|") && line.split("|").length > 2;
}

function normalizeAssistantText(text) {
  return String(text)
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n");
}

function renderTableCell(cell) {
  return cell
    .split(/\n+|&lt;br\s*\/?&gt;|<br\s*\/?>/i)
    .map((line) => renderInlineMarkdown(line.trim()))
    .filter(Boolean)
    .join("<br>");
}

function extractIdeasFromAIResponse(content) {
  const tableIdeas = extractTableIdeas(content);
  const lineIdeas = extractListIdeas(content);

  return uniqueItems(tableIdeas.concat(lineIdeas)).slice(0, 12);
}

function extractListIdeas(content) {
  return normalizeAssistantText(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^[-*]\s+(.+)/) || line.match(/^\d+\.\s+(.+)/))
    .filter(Boolean)
    .map((match) => createIdeaFromText(match[1]))
    .filter(isUsefulIdea);
}

function extractTableIdeas(content) {
  return normalizeAssistantText(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => isMarkdownTableLine(line))
    .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    .slice(1)
    .map((line) => {
      const cells = line.replace(/^\||\|$/g, "").split("|").map(cleanIdeaLine).filter(isUsefulIdea);

      if (cells.length > 1) {
        return {
          title: cells[0],
          detail: cells.slice(1).join(" ")
        };
      }

      return createIdeaFromText(cells[0] || "");
    })
    .filter(isUsefulIdea);
}

function createIdeaFromText(text) {
  const cleanText = cleanIdeaLine(text);
  const splitMatch = cleanText.match(/^(.{3,56}?)(?:\s+[-–—:]\s+)(.{3,})$/);

  if (splitMatch) {
    return {
      title: cleanIdeaLine(splitMatch[1]),
      detail: cleanIdeaLine(splitMatch[2])
    };
  }

  return {
    title: cleanText,
    detail: ""
  };
}

function cleanIdeaLine(line) {
  return normalizeAssistantText(line)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&lt;br\s*\/?&gt;/gi, " ")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^["“]|["”]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulIdea(line) {
  const text = typeof line === "object" ? [line.title, line.detail].filter(Boolean).join(" ") : line;

  if (!text) return false;
  if (text.length < 3) return false;
  if (/^-+$/.test(text)) return false;
  if (/^(theme|category|prompt|sticky|sticky note|idea)$/i.test(text)) return false;
  if (/^(sure thing|let me know|what kind of|here are|i can help|great mood)/i.test(text)) return false;

  return true;
}

function uniqueItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = typeof item === "object"
      ? [item.title, item.detail].filter(Boolean).join(" ").toLowerCase()
      : item.toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function getPlainAIText(content) {
  const ideas = extractIdeasFromAIResponse(content);

  if (ideas.length) {
    return ideas
      .map((idea) => idea.detail ? idea.title + ": " + idea.detail : idea.title)
      .join("\n");
  }

  return "";
}

function getAIHeading(content) {
  const markdownHeading = content.match(/^#{1,3}\s+(.{3,80})$/m)?.[1];

  if (markdownHeading && isUsefulIdea(markdownHeading)) return cleanIdeaLine(markdownHeading);

  const firstStrongText = content.match(/\*\*([^*]{3,80})\*\*/)?.[1];

  if (firstStrongText && isUsefulIdea(firstStrongText)) return cleanIdeaLine(firstStrongText);

  const firstTableIdea = extractTableIdeas(content)[0];

  if (firstTableIdea?.title && firstTableIdea.title.length <= 80) return firstTableIdea.title;

  const firstListIdea = extractListIdeas(content)[0];

  if (firstListIdea?.title && firstListIdea.title.length <= 80) return firstListIdea.title;

  return "";
}

function renderInlineMarkdown(text) {
  return text
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setChatPending(isPending) {
  chatForm.querySelector("button").disabled = isPending;
  chatInput.disabled = isPending;
}

async function sendChatMessage() {
  return window.FigyAI.requestAIReply(chatHistory.slice(0, -1));
}

async function handleChatSubmit(e) {
  e.preventDefault();

  const message = chatInput.value.trim();

  if (!message) return;

  chatInput.value = "";
  chatInput.style.height = "";
  chatHistory.push({ role: "user", content: message });

  if (isMermaidFlowchartCode(message)) {
    chatHistory.push({ role: "assistant", content: message });
    renderChatMessages();
    chatInput.focus();
    return;
  }

  chatHistory.push({ role: "assistant", content: "Thinking..." });
  renderChatMessages();
  setChatPending(true);

  try {
    const reply = await sendChatMessage();
    chatHistory[chatHistory.length - 1] = { role: "assistant", content: reply };
  } catch (error) {
    chatHistory[chatHistory.length - 1] = {
      role: "assistant",
      content: getChatErrorMessage(error)
    };
  } finally {
    setChatPending(false);
    renderChatMessages();
    chatInput.focus();
  }
}

function getChatErrorMessage(error) {
  const message = error?.message || "";

  if (message === "Failed to fetch") {
    return "The Figy chat server is not running. Start it with npm start, then refresh this page and try again.";
  }

  return message || "Start the local Figy server and add your Hugging Face key in .env.";
}

chatToggle.addEventListener("click", () => {
  setChatOpen(!chatPanel.classList.contains("open"));
});

chatClose.addEventListener("click", () => {
  setChatOpen(false);
});

chatForm.addEventListener("submit", handleChatSubmit);

chatInput.addEventListener("input", () => {
  chatInput.style.height = "";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 96) + "px";
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey) return;

  e.preventDefault();
  chatForm.requestSubmit();
});

renderChatMessages();
