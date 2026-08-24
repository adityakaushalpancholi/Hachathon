/**
 * One response envelope for the whole API, so the client never has to guess
 * where the payload lives.
 *
 *   { success: true,  data: <payload>, meta?: {...} }
 *   { success: false, error: { message, code, details? } }
 */
export const ok = (res, data, meta) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.json(body);
};

export const created = (res, data) => res.status(201).json({ success: true, data });

export const paginated = (res, items, { page, limit, total }) =>
  res.json({
    success: true,
    data: items,
    meta: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      hasMore: page * limit < total,
    },
  });

export const fail = (res, status, message, details) =>
  res.status(status).json({
    success: false,
    error: { message, code: status, ...(details ? { details } : {}) },
  });
