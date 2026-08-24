import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Schema-driven request validation.
 *
 *   router.post('/', validate({ body: createBookingSchema }), controller)
 *
 * On success the parsed (and coerced) value replaces the raw input, so
 * controllers always receive typed data.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (!schemas[key]) continue;
      const parsed = schemas[key].parse(req[key]);
      // req.query is a getter on Express 5; assign field-wise to stay compatible.
      if (key === 'query') {
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      } else {
        req[key] = parsed;
      }
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.errors.map((e) => ({
        field: e.path.join('.') || '(root)',
        message: e.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    next(err);
  }
};
