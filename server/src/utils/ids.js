import crypto from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I — read aloud over the phone

const randomFrom = (alphabet, length) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

/** Human-quotable booking reference, e.g. SS-7K2FQ. */
export const bookingCode = () => `SS-${randomFrom(ALPHABET, 5)}`;

/** 4-digit code the customer reads out to the worker. */
export const otpCode = () => String(crypto.randomInt(1000, 10000));

export const txnRef = (prefix = 'TXN') => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomFrom(ALPHABET, 4)}`;

export const membershipId = (coopCode, seq) =>
  `${coopCode}-M${String(seq).padStart(4, '0')}`;
