const { readJsonBody, sendJson } = require("./http");

const defaultModel = "openai/gpt-oss-120b";
const allowedModels = new Set([
  defaultModel,
  "Qwen/Qwen3.8-2.4T-A95B"
]);
const defaultSystemPrompt = "You are Figy Assistant, a concise helper for brainstorming on a whiteboard.";
const defaultMaxTokens = 700;

async function handleChatRequest(req, res, env) {
  const body = await readJsonBody(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const model = getRequestedModel(body.model, env);
  const apiKey = env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    sendJson(res, 200, {
      reply: "Add your Hugging Face API key to .env as HUGGINGFACE_API_KEY, then restart the Figy server. For now, the chat panel is ready and connected locally."
    });
    return;
  }

  const reply = await runChat(messages, env, model);
  sendJson(res, 200, { reply });
}

async function runChat(messages, env, model) {
  if (env.USE_LANGCHAIN === "true") {
    try {
      return await runLangChainChat(messages, env, model);
    } catch (error) {
      console.warn("LangChain unavailable, falling back to Hugging Face API:", error.message);
    }
  }

  return runHuggingFaceChat(messages, env, model);
}

async function runLangChainChat(messages, env, model) {
  const { HuggingFaceInference } = await import("@langchain/community/llms/hf");
  const { PromptTemplate } = await import("@langchain/core/prompts");
  const prompt = PromptTemplate.fromTemplate("{system}\n\n{conversation}\n\nAssistant:");
  const llm = new HuggingFaceInference({
    apiKey: env.HUGGINGFACE_API_KEY,
    model,
    temperature: 0.7,
    maxTokens: getMaxTokens(env)
  });

  return llm.invoke(await prompt.format({
    system: getSystemPrompt(env),
    conversation: formatConversation(messages)
  }));
}

async function runHuggingFaceChat(messages, env, model) {
  const normalizedMessages = normalizeChatMessages(messages, env);

  if (usesHuggingFaceRouter(model, env)) {
    return runHuggingFaceRouterChat(normalizedMessages, env);
  }

  const response = await fetch("https://api-inference.huggingface.co/models/" + model, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.HUGGINGFACE_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: formatPrompt(messages, env),
      parameters: {
        max_new_tokens: getMaxTokens(env),
        temperature: 0.7,
        return_full_text: false
      },
      options: {
        wait_for_model: true
      }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Hugging Face request failed.");
  }

  if (Array.isArray(data) && data[0]?.generated_text) return cleanReply(data[0].generated_text);
  if (data.generated_text) return cleanReply(data.generated_text);
  if (data.error) throw new Error(data.error);

  return "I did not get a readable reply from Hugging Face.";
}

async function runHuggingFaceRouterChat(messages, env) {
  const model = getModel(env);
  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.HUGGINGFACE_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: getMaxTokens(env),
      temperature: 0.7,
      stream: false
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || data.error || "Hugging Face router request failed.");
  }

  const reply = data.choices?.[0]?.message?.content;

  if (reply) return cleanReply(reply);
  if (data.error) throw new Error(data.error?.message || data.error);

  return "I did not get a readable reply from Hugging Face.";
}

function usesHuggingFaceRouter(model, env) {
  if (env.HUGGINGFACE_API_MODE === "router") return true;
  if (env.HUGGINGFACE_API_MODE === "legacy") return false;

  return model.startsWith("openai/gpt-oss") || model.startsWith("Qwen/");
}

function normalizeChatMessages(messages, env) {
  const normalized = messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content.trim()
    }))
    .filter((message) => message.content);

  return [
    { role: "system", content: getSystemPrompt(env) },
    ...normalized
  ];
}

function formatPrompt(messages, env) {
  return [
    getSystemPrompt(env),
    "",
    formatConversation(messages),
    "",
    "Assistant:"
  ].join("\n");
}

function formatConversation(messages) {
  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      return role + ": " + message.content.trim();
    })
    .join("\n");
}

function getSystemPrompt(env) {
  return env.CHAT_SYSTEM_PROMPT || defaultSystemPrompt;
}

function getModel(env) {
  return env.HUGGINGFACE_MODEL || defaultModel;
}

function getRequestedModel(requestedModel, env) {
  const model = typeof requestedModel === "string" && requestedModel.trim()
    ? requestedModel.trim()
    : getModel(env);

  return allowedModels.has(model) ? model : defaultModel;
}

function cleanReply(reply) {
  return removeDanglingMarkdown(String(reply).replace(/^Assistant:\s*/i, "").trim());
}

function getMaxTokens(env) {
  const maxTokens = Number(env.CHAT_MAX_TOKENS);

  return Number.isFinite(maxTokens) ? Math.max(80, Math.min(1600, maxTokens)) : defaultMaxTokens;
}

function removeDanglingMarkdown(reply) {
  const lines = reply.split(/\r?\n/);
  const lastLine = lines[lines.length - 1]?.trim() || "";
  const looksDanglingTableStart = /^\|\s*\*\*?[A-Za-z]{1,24}$/.test(lastLine);
  const looksDanglingBold = /\*\*[^*]{1,40}$/.test(lastLine);

  if (looksDanglingTableStart || looksDanglingBold) {
    lines.pop();
  }

  return lines.join("\n").trim();
}

module.exports = {
  handleChatRequest
};
