import { Request, Response } from 'express';
import { Order, Staff, Product, Sale, Service } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import { orderSerializer, serviceSerializer, money } from '../utils/serializers';
import { populateOrder, attachOrderMeta, cancel as cancelOrder, create as createOrder } from './orders.controller';
import { myToday as staffMyToday } from './staff.controller';
import { requireWorkshop, dayRange, toDateKey } from '../utils/workshop';
import { ACTIVE_ORDER_STATUSES, ORDER_STATUSES } from '../config/constants';
import { AiError } from '../services/ai/client';
import { classifyOrder, ServiceCatalogItem } from '../services/ai/classifyOrder.service';
import { generateReportSummary } from '../services/ai/generateReportSummary.service';

const clientActiveFilter = async (req: Request) => {
  const workshop = await requireWorkshop(req.user);
  return {
    workshop: workshop._id,
    client: req.user._id,
    status: { $in: ACTIVE_ORDER_STATUSES },
  };
};

// Bot uchun xizmatlar ro'yxati (faol)
export const services = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(null);
  const services = await Service.find({ workshop: workshop._id, is_active: true }).sort({ price: 1 });
  res.json({ services: services.map(serviceSerializer) });
});

// Mijozning faol buyurtmasi
export const activeOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await populateOrder(Order.findOne(await clientActiveFilter(req)).sort({ created_at: -1 }));
  if (!order) {
    return res.status(404).json({ detail: 'Faol buyurtma topilmadi' });
  }
  await attachOrderMeta([order]);
  res.json(orderSerializer(order));
});

// Faol buyurtmani bekor qilish (ordersController.cancel orqali)
export const cancelActiveOrder = asyncHandler(async (req: Request, res: Response, next: any) => {
  const order = await Order.findOne(await clientActiveFilter(req)).sort({ created_at: -1 });
  if (!order) {
    throw new ApiError(404, 'Bekor qiladigan faol buyurtma topilmadi');
  }
  (req as any).params = { id: String(order._id) };
  req.body = { ...req.body, reason: 'Telegram bot orqali bekor qilindi' };
  return cancelOrder(req, res, next);
});

// Xodimning bugungi vazifalari
export const staffToday = asyncHandler(async (req: Request, res: Response, next: any) => staffMyToday(req, res, next));

// Tasniflash uchun ustaxonaning faol xizmatlar katalogi
async function serviceCatalog(workshopId: string): Promise<ServiceCatalogItem[]> {
  const docs = await Service.find({ workshop: workshopId, is_active: true }).lean();
  return docs.map((s: any) => ({
    id: String(s._id),
    name: s.name,
    price: s.price ?? null,
    duration_minutes: s.duration_minutes ?? null,
  }));
}

function findMatchedService(catalog: ServiceCatalogItem[], serviceType: string) {
  return catalog.find((s) => s.name.toLowerCase() === serviceType.toLowerCase()) || null;
}

// ============================== AI FUNKSIYA 1: matnni tasniflash ==============================

// Faqat tasniflash (buyurtma yaratmaydi). Claude ishlamay qolsa available:false qaytadi.
export const classifyText = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const text = String(req.body.text || '').trim();
  if (!text) throw new ApiError(400, 'text talab qilinadi');

  const catalog = await serviceCatalog(String(workshop._id));

  let classification;
  try {
    classification = await classifyOrder(text, catalog);
  } catch (err) {
    if (err instanceof AiError) {
      return res.json({ available: false, error: 'ai_unavailable' });
    }
    throw err;
  }

  const matched = findMatchedService(catalog, classification.service_type);
  res.json({
    available: true,
    needs_clarification: classification.needs_clarification,
    question: classification.clarification_question,
    classification: {
      service_type: classification.service_type,
      estimated_duration_minutes: classification.estimated_duration_minutes,
      urgency: classification.urgency,
      summary: classification.summary,
    },
    service_id: matched ? matched.id : null,
  });
});

// Erkin matn asosida buyurtmani avtomatik yaratish.
// - Claude aniqlashtirish so'rasa -> needs_clarification + question (buyurtma yaratilmaydi)
// - Claude ishlamay qolsa -> manual_required (dispetcher qo'lda ishlaydi)
// - Aks holda buyurtma yaratiladi va orderSerializer qaytadi
export const createOrderFromText = asyncHandler(async (req: Request, res: Response, next: any) => {
  const workshop = await requireWorkshop(req.user);
  const text = String(req.body.text || '').trim();
  if (!text) throw new ApiError(400, 'text talab qilinadi');

  const catalog = await serviceCatalog(String(workshop._id));

  let classification;
  try {
    classification = await classifyOrder(text, catalog);
  } catch (err) {
    if (err instanceof AiError) {
      return res.json({ needs_clarification: false, manual_required: true, reason: 'ai_unavailable' });
    }
    throw err;
  }

  if (classification.needs_clarification) {
    return res.json({
      needs_clarification: true,
      question: classification.clarification_question,
      classification: {
        summary: classification.summary,
        confidence: classification.confidence,
      },
    });
  }

  if (!classification.relevant) {
    return res.json({ relevant: false, service_type: classification.service_type });
  }

  const matched = findMatchedService(catalog, classification.service_type);
  req.body = {
    ...(matched ? { service_id: matched.id } : { service_type: classification.service_type }),
    description: text,
    estimated_duration_minutes: classification.estimated_duration_minutes,
    urgency: classification.urgency,
    client_name: req.user.first_name || '',
    client_phone: req.user.phone || '',
  };
  return createOrder(req, res, next);
});

// ============================== AI FUNKSIYA 2: kunlik hisobot xulosasi ==============================

// Ega uchun bugungi hisobot + kam qolgan ombor + AI xulosa
export const ownerReport = asyncHandler(async (req: Request, res: Response) => {
  const workshop = await requireWorkshop(req.user);
  const isOwner = req.user.role === 'owner' || req.user.is_staff;
  const { start, end } = dayRange(new Date());

  const [orders, sales, staffList, products] = await Promise.all([
    Order.find({ workshop: workshop._id, created_at: { $gte: start, $lte: end } }),
    Sale.find({ workshop: workshop._id, created_at: { $gte: start, $lte: end } }),
    isOwner ? Staff.find({ workshop: workshop._id }) : [],
    Product.find({ workshop: workshop._id }),
  ]);

  const revenue = sales.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
  const lowStock = products
    .filter((p: any) => p.min_threshold > 0 && p.quantity <= p.min_threshold)
    .map((p: any) => ({ name: p.name, quantity: p.quantity, threshold: p.min_threshold }));

  const completedCount = orders.filter((o: any) => o.status === ORDER_STATUSES.COMPLETED).length;
  const cancelledCount = orders.filter((o: any) => o.status === ORDER_STATUSES.CANCELLED).length;
  const noShowCount = orders.filter((o: any) => o.status === ORDER_STATUSES.NO_SHOW).length;
  const busyStaff = staffList.filter((s: any) => !s.is_available).length;
  const freeStaff = staffList.filter((s: any) => s.is_available).length;

  const ai_summary = isOwner
    ? await generateReportSummary({
        date: toDateKey(new Date()),
        revenue,
        ordersCount: orders.length,
        completedCount,
        cancelledCount,
        noShowCount,
        busyStaff,
        freeStaff,
        lowStock,
      })
    : null;

  res.json({
    revenue: money(revenue),
    ordersCount: orders.length,
    completedCount,
    cancelledCount,
    noShowCount,
    busyStaff,
    freeStaff,
    lowStock,
    ai_summary,
  });
});
