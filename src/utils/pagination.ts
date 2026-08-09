import { Request } from 'express';
import { PAGE_SIZE } from '../config/constants';

export const parsePage = (req: Request) => {
  const page = Math.max(parseInt(String(req.query.page), 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt(String(req.query.page_size), 10) || PAGE_SIZE, 1),
    100
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
};

export const paginate = (page: number, pageSize: number, total: number) => ({
  count: total,
  next: page * pageSize < total ? page + 1 : null,
  previous: page > 1 ? page - 1 : null,
  results: [],
});

export const paginatedResponse = (page: number, pageSize: number, total: number, results: any[], baseUrl: string) => {
  const totalPages = Math.ceil(total / pageSize);
  let next: string | null = null;
  let previous: string | null = null;
  if (page < totalPages) {
    next = `${baseUrl}?page=${page + 1}&page_size=${pageSize}`;
  }
  if (page > 1) {
    previous = `${baseUrl}?page=${page - 1}&page_size=${pageSize}`;
  }
  return { count: total, next, previous, results };
};
