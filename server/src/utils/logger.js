const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const stamp = () => new Date().toISOString().slice(11, 19);

const write = (color, tag, args) =>
  console.log(`${c.dim}${stamp()}${c.reset} ${color}${tag}${c.reset}`, ...args);

export const logger = {
  info: (...a) => write(c.blue, 'info ', a),
  success: (...a) => write(c.green, 'ok   ', a),
  warn: (...a) => write(c.yellow, 'warn ', a),
  error: (...a) => write(c.red, 'error', a),
  debug: (...a) => write(c.cyan, 'debug', a),
};
