import { Request, Response } from 'express';
import { MasterProfile, Review, Order, Profession } from '../models';
import { ORDER_STATUSES } from '../config/constants';
import { ApiError, asyncHandler } from '../utils/http';
import {
  masterListSerializer,
  masterProfileSerializer,
  masterReviewSerializer,
  reviewSerializer,
  orderSerializer,
} from '../utils/serializers';
import { parsePage } from '../utils/pagination';
import { populateOrder, attachOrderMeta } from './orders.controller';

const USER_FIELDS = 'phone username role avatar language theme location_lat location_lng first_name last_name';

export const list = asyncHandler(async (req: Request, res: Response) => {
  let docs: any[] = await MasterProfile.find({ is_available: true })
    .populate('user', USER_FIELDS)
    .populate('professions');

  if (req.query.professions) {
    const ids = String(req.query.professions).split(',').map((s) => String(s).trim()).filter(Boolean);
    if (ids.length) {
      docs = docs.filter((d) => d.professions.some((p: any) => ids.includes(String(p._id))));
    }
  }

  if (req.query.search) {
    const q = String(req.query.search).toLowerCase();
    docs = docs.filter((d) => {
      const name = [d.user.first_name, d.user.last_name].join(' ').toLowerCase();
      const bio = (d.bio || '').toLowerCase();
      const proNames = d.professions.map((p: any) => p.name_uz).join(' ').toLowerCase();
      return name.includes(q) || bio.includes(q) || proNames.includes(q);
    });
  }

  const ordering = String(req.query.ordering || '-rating');
  const dir = ordering.startsWith('-') ? -1 : 1;
  const field = ordering.replace(/^-/, '');
  const allowedOrder = ['rating', 'rating_count', 'experience_years'];
  if (allowedOrder.includes(field)) {
    docs.sort((a, b) => {
      const av = a[field] || 0;
      const bv = b[field] || 0;
      return (av - bv) * dir;
    });
  }

  const { page, pageSize, skip } = parsePage(req);
  const total = docs.length;
  const pageDocs = docs.slice(skip, skip + pageSize);
  res.json({
    count: total,
    next: page * pageSize < total ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
    results: pageDocs.map(masterListSerializer),
  });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const profile = await MasterProfile.findById(req.params.id)
    .populate('user', USER_FIELDS)
    .populate('professions');
  if (!profile) throw new ApiError(404, 'Master topilmadi');
  res.json(masterListSerializer(profile));
});

export const works = asyncHandler(async (req: Request, res: Response) => {
  const profile = await MasterProfile.findById(req.params.id);
  if (!profile) return res.json([]);
  const orders = await Order.find({ master: profile.user })
    .sort({ created_at: -1 })
    .populate('profession');

  const reviewByOrder = new Map();
  const reviews = await Review.find({ master: profile.user, order: { $in: orders.map((o) => o._id) } });
  for (const r of reviews) reviewByOrder.set(String(r.order), r);

  res.json(
    orders.map((o) => {
      const ser: any = {
        id: String(o._id),
        title: o.title,
        description: o.description,
        status: o.status,
        price: o.price,
        address: o.address,
        location_lat: o.location_lat,
        location_lng: o.location_lng,
        profession: o.profession
          ? { id: String(o.profession._id), name_uz: o.profession.name_uz, name_ru: o.profession.name_ru }
          : null,
        created_at: o.created_at,
      };
      ser.rating = reviewByOrder.has(String(o._id)) ? reviewByOrder.get(String(o._id)).rating : null;
      return ser;
    })
  );
});

export const myProfile = asyncHandler(async (req: Request, res: Response) => {
  let profile: any = await MasterProfile.findOne({ user: req.user._id })
    .populate('user', USER_FIELDS)
    .populate('professions');
  if (!profile) {
    profile = await MasterProfile.create({ user: req.user._id });
    profile = await MasterProfile.findById(profile._id).populate('user', USER_FIELDS).populate('professions');
  }
  res.json(masterProfileSerializer(profile));
});

export const updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
  let profile: any = await MasterProfile.findOne({ user: req.user._id });
  if (!profile) {
    profile = await MasterProfile.create({ user: req.user._id });
  }

  if ('bio' in req.body) profile.bio = req.body.bio;
  if ('is_available' in req.body) profile.is_available = Boolean(req.body.is_available);
  if ('experience_years' in req.body) profile.experience_years = parseInt(req.body.experience_years, 10) || 0;
  if ('profession_ids' in req.body && Array.isArray(req.body.profession_ids)) {
    const professions = await Profession.find({ _id: { $in: req.body.profession_ids } });
    profile.professions = professions.map((p) => p._id);
  }
  await profile.save();

  const populated = await MasterProfile.findById(profile._id)
    .populate('user', USER_FIELDS)
    .populate('professions');
  res.json(masterProfileSerializer(populated));
});

export const availableOrders = asyncHandler(async (req: Request, res: Response) => {
  const orders = await populateOrder(Order.find({ status: ORDER_STATUSES.NEW }).sort({ created_at: -1 }));
  await attachOrderMeta(orders, req.user);
  res.json(orders.map((o) => orderSerializer(o, req.user)));
});

export const reviewsList = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await Review.find({ master: req.user._id })
    .sort({ created_at: -1 })
    .populate('order', 'title')
    .populate('client', 'first_name phone');
  res.json(reviews.map(masterReviewSerializer));
});

export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const orderId = req.body.order;
  const rating = parseInt(req.body.rating, 10);
  const comment = req.body.comment || '';

  if (!orderId) throw new ApiError(400, 'Buyurtma ID kiritilishi kerak.');
  if (!rating || rating < 1 || rating > 5) {
    throw new ApiError(400, "Baholash 1 dan 5 gacha bo'lishi kerak.");
  }

  const order = await Order.findOne({ _id: orderId, client: req.user._id, status: ORDER_STATUSES.COMPLETED });
  if (!order || !order.master) {
    throw new ApiError(400, 'Baholash mumkin emas');
  }

  const existing = await Review.findOne({ order: order._id });
  if (existing) {
    throw new ApiError(400, 'Bu buyurtma allaqachon baholangan');
  }

  const review = await Review.create({
    order: order._id,
    client: req.user._id,
    master: order.master,
    rating,
    comment,
  });

  const allReviews = await Review.find({ master: order.master });
  const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
  const masterProfile = await MasterProfile.findOne({ user: order.master });
  if (masterProfile) {
    masterProfile.rating = totalRating / allReviews.length;
    masterProfile.rating_count = allReviews.length;
    await masterProfile.save();
  }

  res.status(201).json(reviewSerializer(review));
});
