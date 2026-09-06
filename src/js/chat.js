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
      messageElement.innerHTML = renderMarkdown(message.content);
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

  if (!ideas.length && !cleanText) return;

  const actions = document.createElement("div");
  actions.className = "chat-actions";

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
  button.addEventListener("click", onClick);

  return button;
}

function markActionUsed(actions, label) {
  actions.querySelector(".chat-action-status")?.remove();

  const status = document.createElement("span");

  status.className = "chat-action-status";
  status.innerText = label;
  actions.appendChild(status);
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
