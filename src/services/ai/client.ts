import env from '../../config/env';

export class AiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AiError';
  }
}

export const aiEnabled = (): boolean => Boolean(env.AI_API_KEY);

const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
const DEFAULT_TIMEOUT_MS = 15000;

// Gemini (Google AI Studio) API'ga so'rov yuboradi va javob matnini qaytaradi.
// Javob JSON rejimida so'raladi (responseMimeType=application/json).
// Har qanday xato (tarmoq, timeout, HTTP, API) AiError sifatida ko'tariladi —
// chaqiruvchi buni ushlab, xavfsiz fallback qilishi kerak.
export async function askAI(options: {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  if (!aiEnabled()) {
    throw new AiError('AI_API_KEY sozlanmagan');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(GEMINI_ENDPOINT(env.AI_MODEL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': env.AI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: options.system }] },
        contents: [{ role: 'user', parts: [{ text: options.user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: options.maxTokens || 2048,
          temperature: 0.4,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AiError(`AI API HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => (typeof p.text === 'string' ? p.text : ''))
      .join('');
    if (!text || !text.trim()) {
      throw new AiError('AI bo\'sh javob qaytardi');
    }
    return text;
  } catch (err: any) {
    if (err instanceof AiError) throw err;
    if (err && err.name === 'AbortError') {
      throw new AiError('AI API timeout');
    }
    throw new AiError(`AI API chaqiruvi xatosi: ${err?.message || 'noma\'lum'}`, err);
  } finally {
    clearTimeout(timer);
  }
}

// AI javobidan JSON blokini ajratib oladi (markdown kod blokiga o'ralgan bo'lishi mumkin).
export function extractJson(text: string): any {
  let json = text.trim();
  const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) json = fenceMatch[1].trim();
  const first = json.indexOf('{');
  const last = json.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new AiError('AI javobida JSON topilmadi');
  }
  return JSON.parse(json.slice(first, last + 1));
}
