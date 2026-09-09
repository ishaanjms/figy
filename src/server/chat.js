const { readJsonBody, sendJson } = require("./http");
const { guardAIRequest } = require("./usage");

const defaultHuggingFaceModel = "openai/gpt-oss-120b";
const defaultGeminiModel = "gemini-flash-lite-latest";
const allowedModels = new Set([
  defaultHuggingFaceModel,
  "Qwen/Qwen3.8-2.4T-A95B",
  "deepseek-ai/DeepSeek-V4-Pro",
  defaultGeminiModel,
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash"
]);
const defaultSystemPrompt = "You are Figy Assistant, a concise helper for brainstorming on a whiteboard.";
const defaultMaxTokens = 1200;
const defaultUpstreamTimeoutMs = 45000;

async function handleChatRequest(req, res, env) {
  await guardAIRequest(req, env);
  const body = await readJsonBody(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const model = getRequestedModel(body.model, env);
  const provider = getProvider(model, env);
  const maxTokens = getMaxTokens(env, body.maxTokens);
  const responseFormat = body.responseFormat === "json" ? "json" : "text";
  const apiKey = getProviderApiKey(provider, env);

  if (!apiKey) {
    sendJson(res, 503, {
      error: "AI is not configured for this model. Choose another model or contact the board owner."
    });
    return;
  }

  const reply = await runChat(messages, env, model, provider, maxTokens, responseFormat);
  sendJson(res, 200, { reply });
}

async function requestStructuredReply(prompt, env, options = {}) {
  const model = getRequestedModel(options.model, env);
  const provider = getProvider(model, env);
  const maxTokens = getMaxTokens(env, options.maxTokens);
  const apiKey = getProviderApiKey(provider, env);

  if (!apiKey) {
    throw new Error("Add an API key for the selected AI model, then restart locally or redeploy on Vercel.");
  }

  return runChat(
    [{ role: "user", content: String(prompt || "").trim() }],
    env,
    model,
    provider,
    maxTokens,
    "json"
  );
}

function getChatHealth(env) {
  const hasGeminiKey = Boolean(getGeminiApiKey(env));
  const hasHuggingFaceKey = Boolean(env.HUGGINGFACE_API_KEY);

  return {
    ok: true,
    hasGeminiKey,
    hasHuggingFaceKey,
    defaultProvider: getProvider(getDefaultModel(env), env),
    defaultModel: getDefaultModel(env)
  };
}

async function runChat(messages, env, model, provider, maxTokens, responseFormat = "text") {
  if (provider === "gemini") {
    return runGeminiChat(messages, env, getGeminiModel(env, model), maxTokens, responseFormat);
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
    if (getGeminiApiKey(env)) {
      console.warn("Hugging Face unavailable, falling back to Gemini:", error.message);
      return runGeminiChat(messages, env, getGeminiModel(env), maxTokens, responseFormat);
    }

    throw error;
  }
}

async function runGeminiChat(messages, env, model, maxTokens, responseFormat = "text") {
  let lastError = null;

  for (const candidateModel of getGeminiCandidates(model)) {
    try {
      return await requestGeminiModel(messages, env, candidateModel, maxTokens, responseFormat);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error)) break;
    }
  }

  throw lastError || new Error("Gemini request failed.");
}

async function requestGeminiModel(messages, env, model, maxTokens, responseFormat = "text") {
  const apiKey = getGeminiApiKey(env);
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    signal: AbortSignal.timeout(getUpstreamTimeoutMs(env)),
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: getSystemPrompt(env) }]
      },
      contents: normalizeGeminiMessages(messages),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: maxTokens,
        ...(responseFormat === "json" ? { responseMimeType: "application/json" } : {})
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
    return runHuggingFaceRouterChat(normalizedMessages, env, model, maxTokens);
  }

  const response = await fetch("https://api-inference.huggingface.co/models/" + model, {
    signal: AbortSignal.timeout(getUpstreamTimeoutMs(env)),
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

async function runHuggingFaceRouterChat(messages, env, model, maxTokens) {
  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    signal: AbortSignal.timeout(getUpstreamTimeoutMs(env)),
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

  return model.startsWith("openai/gpt-oss")
    || model.startsWith("Qwen/")
    || model.startsWith("deepseek-ai/");
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
  const rawMessages = messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content.trim() }]
    }))
    .filter((message) => message.parts[0].text);

  while (rawMessages[0]?.role === "model") {
    rawMessages.shift();
  }

  const normalized = [];

  rawMessages.forEach((message) => {
    const previousMessage = normalized[normalized.length - 1];

    if (previousMessage?.role === message.role) {
      previousMessage.parts[0].text += "\n\n" + message.parts[0].text;
      return;
    }

    normalized.push(message);
  });

  return normalized.length ? normalized : [{ role: "user", parts: [{ text: "Hello" }] }];
}

function getSystemPrompt(env) {
  return env.CHAT_SYSTEM_PROMPT || defaultSystemPrompt;
}

function getHuggingFaceModel(env) {
  return env.HUGGINGFACE_MODEL || defaultHuggingFaceModel;
}

function getGeminiModel(env, requestedModel = "") {
  if (env.GEMINI_MODEL) return normalizeRequestedModel(env.GEMINI_MODEL);
  if (isGeminiModel(requestedModel)) return requestedModel;

  return defaultGeminiModel;
}

function getRequestedModel(requestedModel, env) {
  const model = typeof requestedModel === "string" && requestedModel.trim()
    ? requestedModel.trim()
    : getDefaultModel(env);
  const normalizedModel = normalizeRequestedModel(model);

  if (allowedModels.has(normalizedModel) || isGeminiModel(normalizedModel)) return normalizedModel;

  return getDefaultModel(env);
}

function getDefaultModel(env) {
  return getGeminiApiKey(env) && !env.HUGGINGFACE_API_KEY ? getGeminiModel(env) : getHuggingFaceModel(env);
}

function getProvider(model, env) {
  const requestedProvider = String(env.AI_PROVIDER || "").trim().toLowerCase();

  if (requestedProvider === "gemini" || requestedProvider === "huggingface") return requestedProvider;
  if (isGeminiModel(model)) return "gemini";
  if (getGeminiApiKey(env) && !env.HUGGINGFACE_API_KEY) return "gemini";

  return "huggingface";
}

function getProviderApiKey(provider, env) {
  return provider === "gemini" ? getGeminiApiKey(env) : env.HUGGINGFACE_API_KEY;
}

function getGeminiApiKey(env) {
  return env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || "";
}

function isGeminiModel(model) {
  return /^gemini-/i.test(String(model || ""));
}

function normalizeRequestedModel(model) {
  if (model === "gemini-2.0-flash") return defaultGeminiModel;

  return model;
}

function getGeminiCandidates(model) {
  return Array.from(new Set([
    normalizeRequestedModel(model),
    defaultGeminiModel,
    "gemini-2.5-flash"
  ].filter(Boolean)));
}

function isRetryableGeminiError(error) {
  return /high demand|temporar|timeout|abort|overload|unavailable|try again/i.test(error?.message || "");
}

function cleanReply(reply) {
  return removeDanglingMarkdown(String(reply).replace(/^Assistant:\s*/i, "").trim());
}

function getMaxTokens(env, requestedMaxTokens) {
  const maxTokens = Number(requestedMaxTokens || env.CHAT_MAX_TOKENS);

  return Number.isFinite(maxTokens) ? Math.max(80, Math.min(4000, maxTokens)) : defaultMaxTokens;
}

function getUpstreamTimeoutMs(env) {
  const timeout = Number(env.AI_UPSTREAM_TIMEOUT_MS);

  return Number.isFinite(timeout) ? Math.max(5000, Math.min(50000, timeout)) : defaultUpstreamTimeoutMs;
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
  handleChatRequest,
  getChatHealth,
  requestStructuredReply
};
