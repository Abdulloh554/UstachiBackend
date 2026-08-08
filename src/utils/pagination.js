const { PAGE_SIZE } = require('../config/constants');

const parsePage = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.page_size, 10) || PAGE_SIZE, 1),
    100
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
};

const paginate = (page, pageSize, total) => ({
  count: total,
  next: page * pageSize < total ? page + 1 : null,
  previous: page > 1 ? page - 1 : null,
  results: [],
});

const paginatedResponse = (page, pageSize, total, results, baseUrl) => {
  const totalPages = Math.ceil(total / pageSize);
  let next = null;
  let previous = null;
  if (page < totalPages) {
    next = `${baseUrl}?page=${page + 1}&page_size=${pageSize}`;
  }
  if (page > 1) {
    previous = `${baseUrl}?page=${page - 1}&page_size=${pageSize}`;
  }
  return { count: total, next, previous, results };
};

module.exports = { parsePage, paginate, paginatedResponse };
