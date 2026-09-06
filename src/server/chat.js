const { readJsonBody, sendJson } = require("./http");

const defaultHuggingFaceModel = "openai/gpt-oss-120b";
const defaultGeminiModel = "gemini-2.5-flash";
const allowedModels = new Set([
  defaultHuggingFaceModel,
  "Qwen/Qwen3.8-2.4T-A95B",
  defaultGeminiModel,
  "gemini-2.0-flash"
]);
const defaultSystemPrompt = "You are Figy Assistant, a concise helper for brainstorming on a whiteboard.";
const defaultMaxTokens = 1200;

async function handleChatRequest(req, res, env) {
  const body = await readJsonBody(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const model = getRequestedModel(body.model, env);
  const provider = getProvider(model, env);
  const maxTokens = getMaxTokens(env, body.maxTokens);
  const apiKey = getProviderApiKey(provider, env);

  if (!apiKey) {
    sendJson(res, 200, {
      reply: "Add your Gemini API key to .env as GEMINI_API_KEY, or add a Hugging Face key as HUGGINGFACE_API_KEY, then restart the Figy server."
    });
    return;
  }

  const reply = await runChat(messages, env, model, provider, maxTokens);
  sendJson(res, 200, { reply });
}

async function runChat(messages, env, model, provider, maxTokens) {
  if (provider === "gemini") {
    return runGeminiChat(messages, env, getGeminiModel(env, model), maxTokens);
  }

  if (env.USE_LANGCHAIN === "true") {
    try {
      return await runLangChainChat(messages, env, model, maxTokens);
    } catch (error) {
      console.warn("LangChain unavailable, falling back to Hugging Face API:", error.message);
    }
  }

  try {
    return await runHuggingFaceChat(messages, env, model, maxTokens);
  } catch (error) {
    if (env.GEMINI_API_KEY) {
      console.warn("Hugging Face unavailable, falling back to Gemini:", error.message);
      return runGeminiChat(messages, env, getGeminiModel(env), maxTokens);
    }

    throw error;
  }
}

async function runGeminiChat(messages, env, model, maxTokens) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: {
      "x-goog-api-key": env.GEMINI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: getSystemPrompt(env) }]
      },
      contents: normalizeGeminiMessages(messages),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: maxTokens
      }
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || data.error || "Gemini request failed.");
  }

  const reply = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (reply) return cleanReply(reply);
  if (data.error) throw new Error(data.error?.message || data.error);

  return "I did not get a readable reply from Gemini.";
}

async function runLangChainChat(messages, env, model, maxTokens) {
  const { HuggingFaceInference } = await import("@langchain/community/llms/hf");
  const { PromptTemplate } = await import("@langchain/core/prompts");
  const prompt = PromptTemplate.fromTemplate("{system}\n\n{conversation}\n\nAssistant:");
  const llm = new HuggingFaceInference({
    apiKey: env.HUGGINGFACE_API_KEY,
    model,
    temperature: 0.7,
    maxTokens
  });

  return llm.invoke(await prompt.format({
    system: getSystemPrompt(env),
    conversation: formatConversation(messages)
  }));
}

async function runHuggingFaceChat(messages, env, model, maxTokens) {
  const normalizedMessages = normalizeChatMessages(messages, env);

  if (usesHuggingFaceRouter(model, env)) {
    return runHuggingFaceRouterChat(normalizedMessages, env, maxTokens);
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
        max_new_tokens: maxTokens,
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

async function runHuggingFaceRouterChat(messages, env, maxTokens) {
  const model = getHuggingFaceModel(env);
  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.HUGGINGFACE_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
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

function normalizeGeminiMessages(messages) {
  const normalized = messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content.trim() }]
    }))
    .filter((message) => message.parts[0].text);

  return normalized.length ? normalized : [{ role: "user", parts: [{ text: "Hello" }] }];
}

function getSystemPrompt(env) {
  return env.CHAT_SYSTEM_PROMPT || defaultSystemPrompt;
}

function getHuggingFaceModel(env) {
  return env.HUGGINGFACE_MODEL || defaultHuggingFaceModel;
}

function getGeminiModel(env, requestedModel = "") {
  if (env.GEMINI_MODEL) return env.GEMINI_MODEL;
  if (isGeminiModel(requestedModel)) return requestedModel;

  return defaultGeminiModel;
}

function getRequestedModel(requestedModel, env) {
  const model = typeof requestedModel === "string" && requestedModel.trim()
    ? requestedModel.trim()
    : getDefaultModel(env);

  if (allowedModels.has(model) || isGeminiModel(model)) return model;

  return getDefaultModel(env);
}

function getDefaultModel(env) {
  return env.GEMINI_API_KEY && !env.HUGGINGFACE_API_KEY ? getGeminiModel(env) : getHuggingFaceModel(env);
}

function getProvider(model, env) {
  const requestedProvider = String(env.AI_PROVIDER || "").trim().toLowerCase();

  if (requestedProvider === "gemini" || requestedProvider === "huggingface") return requestedProvider;
  if (isGeminiModel(model)) return "gemini";
  if (env.GEMINI_API_KEY && !env.HUGGINGFACE_API_KEY) return "gemini";

  return "huggingface";
}

function getProviderApiKey(provider, env) {
  return provider === "gemini" ? env.GEMINI_API_KEY : env.HUGGINGFACE_API_KEY;
}

function isGeminiModel(model) {
  return /^gemini-/i.test(String(model || ""));
}

function cleanReply(reply) {
  return removeDanglingMarkdown(String(reply).replace(/^Assistant:\s*/i, "").trim());
}

function getMaxTokens(env, requestedMaxTokens) {
  const maxTokens = Number(requestedMaxTokens || env.CHAT_MAX_TOKENS);

  return Number.isFinite(maxTokens) ? Math.max(80, Math.min(2400, maxTokens)) : defaultMaxTokens;
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
