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

  chatHistory.forEach((message) => {
    const messageElement = document.createElement("div");
    messageElement.className = "chat-message " + message.role;

    if (message.role === "assistant") {
      messageElement.innerHTML = renderMarkdown(message.content);
    } else {
      messageElement.textContent = message.content;
    }

    chatMessages.appendChild(messageElement);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderMarkdown(markdown) {
  const escaped = escapeHtml(markdown);
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
        html.push("<tr>" + cells.map((cell) => "<" + tag + ">" + renderInlineMarkdown(cell) + "</" + tag + ">").join("") + "</tr>");
      });
      html.push("</table>");
    }

    tableBuffer = [];
  }
}

function isMarkdownTableLine(line) {
  return line.includes("|") && line.split("|").length > 2;
}

function renderInlineMarkdown(text) {
  return text
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
