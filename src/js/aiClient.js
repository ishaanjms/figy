const figyChatApiUrls = ["/api/chat", "http://127.0.0.1:4317/api/chat"];

async function requestAIReply(messages) {
  let lastError = null;

  for (const chatApiUrl of figyChatApiUrls) {
    try {
      return await requestChatReply(chatApiUrl, messages);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Chat is not available right now.");
}

async function requestChatReply(chatApiUrl, messages) {
  const response = await fetch(chatApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messages })
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

window.FigyAI = {
  requestAIReply
};
