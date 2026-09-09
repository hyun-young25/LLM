export const DEMO_NOTE = "교육용 예시 후보입니다. 실제 GPT의 토큰이나 내부 확률을 측정한 값이 아닙니다.";

export function demoPrediction(body = {}) {
  const input = String(body.userInput || body.originalInput || body.context || "");
  const plans = /날씨|기온/.test(input)
    ? [["실시간", "현재"], ["날씨는", "기온은"], ["기상", "날씨"], ["정보를", "예보를"], ["확인해", "살펴봐"], ["주세요.", "보세요."]]
    : /안녕|반가/.test(input)
      ? [["안녕하세요!", "반갑습니다!"], ["함께", "차근차근"], ["AI의", "모델의"], ["생성", "예측"], ["원리를", "과정을"], ["살펴봐요.", "배워봐요."]]
      : [["AI는", "모델은"], ["앞선", "입력된"], ["문맥을", "정보를"], ["바탕으로", "참고하여"], ["다음", "이어질"], ["토큰을", "조각을"], ["선택해요.", "예측해요."]];
  const step = Array.isArray(body.generatedTokens) ? body.generatedTokens.length : 0;
  const pair = plans[step];
  const candidates = pair ? pair.map((token, index) => ({ token, probability: index ? 0.28 : 0.72 })) : [{ token: "<eos>", probability: 1 }];
  return { source: "demo", candidates, nextToken: candidates[0].token, note: DEMO_NOTE };
}

export async function requestPrediction(body, { mode = "demo", signal, endpoint = "./api/gemini-next-token" } = {}) {
  signal?.throwIfAborted();
  if (mode === "demo") return demoPrediction(body);
  const timeout = AbortSignal.timeout(25000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Gemini 서버에 연결할 수 없습니다. 교육용 데모를 선택하거나 서버 설정을 확인해 주세요.");
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "예측 요청에 실패했습니다.");
    if (!Array.isArray(payload?.candidates) || !payload.candidates.length) throw new Error("유효한 후보가 없습니다. 다시 예측해 주세요.");
    return payload;
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) throw new Error("응답 시간이 초과되었습니다. 다시 시도해 주세요.");
    throw error;
  }
}
