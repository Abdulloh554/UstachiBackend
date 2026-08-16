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

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const attempts = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        const err = new AiError(`AI API HTTP ${res.status}: ${body.slice(0, 300)}`);
        if (attempt < attempts && (res.status === 429 || res.status === 500 || res.status >= 503)) {
          lastError = err;
          continue; // transisent xato — qayta urinamiz
        }
        throw err;
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
        const e = new AiError('AI API timeout');
        if (attempt < attempts) {
          lastError = e;
          continue;
        }
        throw e;
      }
      throw new AiError(`AI API chaqiruvi xatosi: ${err?.message || 'noma\'lum'}`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new AiError('AI API muvaffaqiyatsiz');
}

// AI javobidan birinchi to'liq JSON obyektini ajratib oladi.
// Model ba'zan markdown kod bloki, oldindan yoki keyingi matn, hatto bir nechta
// JSON obyekt qaytarishi mumkin — bu usul birinchi balanslangan { } blokni oladi.
export function extractJson(text: string): any {
  let json = text.trim();
  const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) json = fenceMatch[1].trim();

  const start = json.indexOf('{');
  if (start === -1) {
    throw new AiError('AI javobida JSON obyekt topilmadi');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = json.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (err: any) {
          throw new AiError(`AI JSON parse xatosi: ${err?.message || 'noma\'lum'}`, err);
        }
      }
    }
  }
  throw new AiError('AI javobida to\'liq JSON obyekt topilmadi');
}
