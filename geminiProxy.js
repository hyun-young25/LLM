const DEFAULT_MODEL = "gemini-2.5-flash";

export function geminiProxyPlugin(env = {}) {
  return {
    name: "gemini-next-token-proxy",
    configureServer(server) {
      server.middlewares.use("/api/gemini-next-token", (req, res) => handleGeminiRequest(req, res, env));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/gemini-next-token", (req, res) => handleGeminiRequest(req, res, env));
    },
  };
}

export async function handleGeminiRequest(req, res, env = {}) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    sendJson(res, 415, { error: "JSON 요청이 필요합니다." });
    return;
  }
  try {
    const body = await readJson(req);
    const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL;

    if (!isConfiguredApiKey(apiKey)) {
      sendJson(res, 503, { error: "서버에 API 키가 없습니다. 교육용 데모를 선택해 주세요.", source: "server" });
      return;
    }

    const prediction = await requestPrediction(body, apiKey, model);
    sendJson(res, 200, prediction);
  } catch (error) {
    sendJson(res, 500, {
      error: error?.name === "TimeoutError" ? "Gemini 응답 시간이 초과되었습니다." : "Gemini 요청에 실패했습니다. 서버의 API 키, 모델명, 할당량을 확인해 주세요.",
      source: "server",
    });
  }
}

function buildGeminiPayload(body) {
  const context = String(body?.context || "").slice(0, 1200);
  const temperature = 0.2; // Candidate authoring is fixed; UI temperature is applied once during sampling.
  const testMode = body?.mode === "test";
  const style = "balanced";
  const promptLines = testMode
    ? buildTestPromptLines(body, style)
    : buildDefaultPromptLines(body, context, style);
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: promptLines.join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseSchema: {
        type: "OBJECT",
        properties: {
          nextToken: { type: "STRING" },
          candidates: {
            type: "ARRAY",
            minItems: 2,
            maxItems: 2,
            items: {
              type: "OBJECT",
              properties: {
                token: { type: "STRING" },
                probability: { type: "NUMBER" },
              },
              required: ["token", "probability"],
            },
          },
        },
        required: ["nextToken", "candidates"],
      },
    },
  };
}

function buildDefaultPromptLines(body, context, style) {
  const originalInput = String(body?.originalInput || context).slice(0, 600);
  const generatedTokens = formatTokenSequence(body?.generatedTokens, 32);
  const intentHints = buildIntentHints(originalInput);

  return [
    "JSON only. Return exactly 2 next-token candidates for natural Korean.",
    "Treat original as a user message; generate an assistant response for questions, requests, and statements.",
    "Use the whole original and fullPrefix, not only the last token.",
    "Do not repeat the last generated token or any generated 2/3-token sequence.",
    "Use short tokens; probabilities sum to 1; nextToken is the best non-repeating candidate.",
    `style:${style}`,
    ...intentHints,
    `original:${originalInput}`,
    `fullPrefix:${context}`,
    `generatedTokens:${generatedTokens}`,
  ];
}

function buildTestPromptLines(body, style) {
  const iteration = Number.isFinite(Number(body?.iteration)) ? Number(body.iteration) : 0;
  const maxIterations = Number.isFinite(Number(body?.maxIterations)) ? Number(body.maxIterations) : 6;
  const remaining = Math.max(0, maxIterations - iteration - 1);
  const userInput = String(body?.userInput || "").slice(0, 360);
  const generated = String(body?.generated || "").slice(0, 240);
  const generatedTokens = formatTokenSequence(body?.generatedTokens, 10);
  const intentHints = buildIntentHints(userInput);

  return [
    "JSON only. Return exactly 2 candidates for the next token of a short Korean answer.",
    "Plan from the whole input and sofar; preserve grammar; avoid repeated tokens or phrases.",
    "Use one word, particle, ending, punctuation, or <eos>. Choose <eos> when complete.",
    `style:${style}`,
    ...intentHints,
    `input:${userInput}`,
    `sofar:${generated || "(none)"}`,
    `tokens:${generatedTokens}`,
    `iter:${iteration + 1}/${maxIterations},remain:${remaining}`,
  ];
}

function buildIntentHints(input) {
  const text = String(input || "").trim();
  const hints = [];
  if (/(누구|어떤\s*사람|어떤\s*인물)/.test(text)) {
    hints.push("Person: answer only if confident; if ambiguous, say 더 자세한 정보가 필요해요. Never invent facts.");
  }
  if (/(날씨|기온|비\s*(?:와|올|오)|눈\s*(?:와|올|오))/.test(text)) {
    hints.push("Live weather unavailable: say 실시간 확인이 필요해요.");
  }
  return hints;
}

function formatTokenSequence(tokens, limit = 32) {
  const sequence = (Array.isArray(tokens) ? tokens : [])
    .map((token) => String(token || "").trim())
    .filter(Boolean)
    .slice(-limit);
  return sequence.length ? JSON.stringify(sequence) : "(none)";
}

async function requestPrediction(body, apiKey, model) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildGeminiPayload(body)),
      signal: AbortSignal.timeout(20000),
    },
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Prediction request failed");
  }

  const parsed = parseGeminiJson(payload);
  return normalizePrediction(parsed, body);
}

function parseGeminiJson(payload) {
  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "";
  if (!text) throw new Error("빈 예측 응답을 반환했습니다.");
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return parsePredictionJson(cleaned);
}

function parsePredictionJson(text) {
  const direct = tryParseJson(text);
  if (direct) return normalizeParsedJson(direct);

  const jsonObject = extractJsonObject(text);
  const extracted = tryParseJson(jsonObject);
  if (extracted) return normalizeParsedJson(extracted);

  throw new Error("예측 응답을 JSON으로 해석하지 못했습니다.");
}

function normalizeParsedJson(value) {
  if (typeof value === "string") {
    const nested = tryParseJson(value);
    if (nested) return normalizeParsedJson(nested);
  }
  if (Array.isArray(value)) return value[0] || {};
  return value;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function normalizePrediction(value, body = {}) {
  const rawCandidates = Array.isArray(value?.candidates) ? value.candidates : [];
  const candidates = rawCandidates
    .map((item, index) => ({
      token: String(item?.token || "").trim().slice(0, 120),
      probability: Number.isFinite(Number(item?.probability)) ? Number(item.probability) : 0,
    }))
    .filter((item, index, all) => item.token && all.findIndex(other => other.token === item.token) === index)
    .slice(0, 2);

  if (!candidates.length) throw new Error("유효한 후보가 없습니다.");
  const generatedTokens = normalizeTokenSequence(body?.generatedTokens);
  const nonRepetitive = candidates.filter(
    (candidate) => !wouldRepeatGeneratedSequence(candidate.token, generatedTokens),
  );
  const usableCandidates = generatedTokens.length ? nonRepetitive : candidates;
  const normalized = normalizeProbabilities(usableCandidates.length ? usableCandidates : [{ token: "<eos>", probability: 1 }]).sort((a, b) => b.probability - a.probability);
  const rawNextToken = String(value?.nextToken || "").trim();
  const nextToken =
    normalized.find((candidate) => candidate.token === rawNextToken)?.token ||
    normalized[0]?.token ||
    "";
  return {
    source: "gemini",
    nextToken,
    candidates: normalized,
    note: "Gemini가 생성한 교육용 후보와 추정 확률이며, 실제 모델의 내부 확률은 아닙니다.",
  };
}

function normalizeTokenSequence(tokens) {
  return (Array.isArray(tokens) ? tokens : [])
    .map((token) => String(token || "").trim())
    .filter(Boolean);
}

function wouldRepeatGeneratedSequence(token, history) {
  const normalized = String(token || "").trim();
  if (!normalized || !history.length) return false;
  if (history.at(-1) === normalized) return true;

  const sequence = [...history, normalized];
  for (let size = 2; size <= 3; size += 1) {
    if (sequence.length < size * 2) continue;
    const tail = sequence.slice(-size).join("\u0000");
    for (let start = 0; start <= sequence.length - size * 2; start += 1) {
      if (sequence.slice(start, start + size).join("\u0000") === tail) return true;
    }
  }
  return false;
}

function normalizeProbabilities(candidates) {
  if (!candidates.length) return [];
  const sum = candidates.reduce((total, item) => total + Math.max(0, item.probability), 0);
  if (sum > 0) {
    return candidates.map((item) => ({ ...item, probability: Math.max(0, item.probability) / sum }));
  }
  const probability = 1 / candidates.length;
  return candidates.map((item) => ({ ...item, probability }));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: {
        message: "예측 응답이 JSON 형식이 아닙니다.",
      },
      raw: text.slice(0, 300),
    };
  }
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isConfiguredApiKey(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && normalized !== "your_api_key_here");
}
