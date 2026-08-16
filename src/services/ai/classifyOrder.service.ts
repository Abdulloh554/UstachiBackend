import { askAI, extractJson, AiError } from './client';

export interface ServiceCatalogItem {
  id: string;
  name: string;
  price: number | null;
  duration_minutes: number | null;
}

export type Urgency = 'past' | "o'rta" | 'yuqori';

export interface OrderClassification {
  service_type: string;
  estimated_duration_minutes: number;
  urgency: Urgency;
  summary: string;
  confidence: number;
  relevant: boolean;
  needs_clarification: boolean;
  clarification_question: string | null;
}

const URGENCIES: Urgency[] = ['past', "o'rta", 'yuqori'];

const SYSTEM_PROMPT = `Siz "Ustachi" santexnika va elektr ta'mirlash ustaxonasining buyurtma tasniflovchisisiz.

Foydalanuvchi muammosini tavsiflab, muammosiz matn yuboradi. Sizning vazifangiz:
1) Muammoni eng mos xizmat turiga (service_type) tasniflash. Agar ro'yxatdan mosi bo'lmasa, qisqa va aniq o'zbekcha nom bering.
2) Ishning taxminiy davomiyligini daqiqada baholash (estimated_duration_minutes).
3) Shoshilinchlikni baholash (urgency): "past", "o'rta" yoki "yuqori".
4) Xulosa yozish (summary) — 1 jumla, o'zbek tilida.
5) confidence — tasnifga ishonch darajasi 0 dan 1 gacha.
6) Agar mijozning muammosi ustaxona xizmatlariga (santexnika, elektr, ta'mirlash-o'rnatish) umuman aloqasi bo'lmasa — masalan, noutbuk/telefon/mashina ta'mirlash — relevant=false qiling, service_type'ni o'zbekcha bering va aniqlashtirish so'ramang. Aks holda relevant=true.
7) Matn noaniq, qisqa yoki xizmat turlariga mos kelmaydigan bo'lsa needs_clarification=true qiling va clarification_question bilan aniqlashtiruvchi savol bering (o'zbek tilida).

QUIDDAGI QAT'IY JSON FORMATDA JAVOB BERING, BOSHQA HECH NARSA YOZMANG:
{"service_type": "quduq", "estimated_duration_minutes": 30, "urgency": "past", "confidence": 0.9, "summary": "...", "relevant": true, "needs_clarification": false, "clarification_question": null}`;

const CONFIDENCE_CLARIFICATION_THRESHOLD = 0.5;

const FALLBACK_QUESTION = "Muammoingizni biroz batafsilroq yozib bering: nima sodir bo'ldi, qayerda (oshxona/hammom/suv ta'minoti/elektr) va qachondan beri?";

function validateClassification(raw: any): OrderClassification {
  if (!raw || typeof raw !== 'object') {
    throw new AiError('Klassifikatsiya JSON obyekt emas');
  }

  const service_type = typeof raw.service_type === 'string' ? raw.service_type.trim() : '';
  const durationNum = Number(raw.estimated_duration_minutes);
  const hasValidDuration = Number.isFinite(durationNum) && durationNum >= 5 && durationNum <= 1440;
  const confNum = Number(raw.confidence);
  const hasValidConfidence = Number.isFinite(confNum) && confNum >= 0 && confNum <= 1;
  const urgencyRaw = String(raw.urgency || '').trim();
  const hasValidUrgency = URGENCIES.includes(urgencyRaw as Urgency);

  const rawNeedsClarification = Boolean(raw.needs_clarification);
  const rawQuestion =
    typeof raw.clarification_question === 'string' && raw.clarification_question.trim()
      ? raw.clarification_question.trim()
      : null;

  let needs_clarification = rawNeedsClarification;
  let clarification_question = rawQuestion;

  const relevant = typeof raw.relevant === 'boolean' ? raw.relevant : true;

  // Ishonch past bo'lsa — aniqlashtirishni majburan yoqamiz (noto'g'ri tasniflash oldini olish).
  if (hasValidConfidence && confNum < CONFIDENCE_CLARIFICATION_THRESHOLD) {
    needs_clarification = true;
  }

  if (!relevant) {
    needs_clarification = false;
    clarification_question = null;
  }

  if (needs_clarification) {
    // Noaniq matnda noto'g'ri tasnif yuborilmasligi uchun maydonlar talab qilinmaydi.
    if (!clarification_question) clarification_question = FALLBACK_QUESTION;
  } else {
    if (!service_type) throw new AiError('service_type yo\'q yoki bo\'sh');
    if (!hasValidDuration) throw new AiError('estimated_duration_minutes yaroqsiz');
    if (!hasValidConfidence) throw new AiError('confidence yaroqsiz');
    if (!hasValidUrgency) throw new AiError('urgency yaroqsiz');
  }

  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';

  return {
    service_type,
    estimated_duration_minutes: hasValidDuration ? Math.round(durationNum) : 60,
    urgency: hasValidUrgency ? (urgencyRaw as Urgency) : "o'rta",
    summary,
    confidence: hasValidConfidence ? confNum : 0,
    relevant,
    needs_clarification,
    clarification_question,
  };
}

// Mijoz erkin matnini tasniflaydi. Xato/vaqt o'tishi/mos kelmaslikda AiError ko'tariladi —
// chaqiruvchi dispetcherga qo'lda ishlash uchun yuborishi kerak.
export async function classifyOrder(
  text: string,
  catalog: ServiceCatalogItem[]
): Promise<OrderClassification> {
  const clean = String(text || '').trim();
  if (!clean) throw new AiError('Tasniflash uchun matn bo\'sh');

  const catalogLine = catalog.length
    ? catalog.map((s) => `- ${s.name} (narxi: ${s.price ?? 'noma\'lum'} so'm, davomiyligi: ${s.duration_minutes ?? '?'} daqiqa)`).join('\n')
    : '(ro\'yxat bo\'sh — xizmat turini o\'zingiz o\'zbekcha bering)';

  const raw = extractJson(
    await askAI({
      system: SYSTEM_PROMPT,
      user: `Ustaxonadagi mavjud xizmatlar:\n${catalogLine}\n\nMijozning xabari:\n"""${clean}"""`,
      maxTokens: 2048,
    })
  );

  return validateClassification(raw);
}
