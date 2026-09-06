const figyChatApiUrls = getFigyChatApiUrls();
const defaultFigyModel = "openai/gpt-oss-120b";
const figyModelStorageKey = "figy-ai-model";

function getFigyChatApiUrls() {
  const urls = ["/api/chat"];
  const isLocalPage = ["", "localhost", "127.0.0.1"].includes(window.location.hostname);

  if (isLocalPage && window.location.port !== "4317") {
    urls.push("http://127.0.0.1:4317/api/chat");
  }

  return urls;
}

async function requestAIReply(messages, options = {}) {
  let lastError = null;

  for (const chatApiUrl of figyChatApiUrls) {
    try {
      return await requestChatReply(chatApiUrl, messages, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Chat is not available right now.");
}

async function requestChatReply(chatApiUrl, messages, options = {}) {
  const response = await fetch(chatApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages,
      model: getSelectedAIModel(),
      maxTokens: options.maxTokens
    })
  });

  const responseText = await response.text();
  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { error: responseText };
  }

  if (!response.ok) {
    throw new Error(data.error || "Chat is not available right now.");
  }

  if (!data.reply) {
    throw new Error("Start the Figy chat server with npm start, then use the chat again.");
  }

  return data.reply;
}

function getSelectedAIModel() {
  return localStorage.getItem(figyModelStorageKey) || defaultFigyModel;
}

window.FigyAI = {
  requestAIReply,
  getSelectedAIModel
};
