import { askAI, extractJson, AiError } from './client';

export interface DailyReportData {
  date: string;
  revenue: number;
  ordersCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  busyStaff: number;
  freeStaff: number;
  lowStock: { name: string; quantity: number; threshold: number }[];
}

export interface ReportSummary {
  summary: string;
  recommendation: string;
}

const SYSTEM_PROMPT = `Siz "Ustachi" santexnika va elektr ta'mirlash ustaxonasi egalari uchun biznes-tahlilchisisiz.

Sizga kunlik hisobotning xom raqamlari beriladi. Vazifangiz:
1) summary — 2-3 gaplik, insoniy tilda yozilgan kun xulosasi (o'zbek tilida). Unda aniq raqamlar va diqqatga sazovor jihatlar bo'lishi kerak (tushum, bajarilgan/bekor/no_show, band/bo'sh ustalar, kam qolgan mahsulotlar).
2) recommendation — bitta amaliy, aniq tavsiya (masalan: eslatma vaqtini oshirish, no_show bo'lgan ustalarga qo'ng'iroq, omborni to'ldirish, xizmat narxini ko'rib chiqish).

QAT'IY QOIDA: raqamlarga yolg'on ma'lumot qo'shmang, faqat berilgan ma'lumotdan foydalaning.

QUYIDAGI QAT'IY JSON FORMATDA JAVOB BERING, BOSHQA HECH NARSA YOZMANG:
{"summary": "2-3 jumlalik xulosa...", "recommendation": "Bitta aniq tavsiya..."}`;

function validateSummary(raw: any): ReportSummary {
  if (!raw || typeof raw !== 'object') {
    throw new AiError('AI xulosa JSON obyekt emas');
  }
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const recommendation = typeof raw.recommendation === 'string' ? raw.recommendation.trim() : '';
  if (!summary || !recommendation) {
    throw new AiError('AI xulosa maydonlari to\'liq emas');
  }
  return { summary, recommendation };
}

// Kunlik hisobot raqamlarini inson tilidagi xulosaga aylantiradi.
// Claude ishlamay qolsa null qaytariladi — egasi raqamli hisobotni xulosasiz ko'radi.
export async function generateReportSummary(data: DailyReportData): Promise<ReportSummary | null> {
  try {
    const lowStockLine = data.lowStock.length
      ? data.lowStock.map((p) => `${p.name} (qoldiq ${p.quantity}/${p.threshold})`).join(', ')
      : 'yo\'q';

    const input = JSON.stringify(
      {
        date: data.date,
        revenue: data.revenue,
        orders_count: data.ordersCount,
        completed: data.completedCount,
        cancelled: data.cancelledCount,
        no_show: data.noShowCount,
        busy_staff: data.busyStaff,
        free_staff: data.freeStaff,
        low_stock: lowStockLine,
      },
      null,
      2
    );

    const raw = extractJson(
      await askAI({
        system: SYSTEM_PROMPT,
        user: `Bugungi hisobot raqamlari:\n${input}`,
        maxTokens: 2048,
      })
    );

    return validateSummary(raw);
  } catch (err) {
    if (err instanceof AiError) {
      console.error('[ai] generateReportSummary:', err.message);
    } else {
      console.error('[ai] generateReportSummary noma\'lum xato:', err);
    }
    return null;
  }
}
