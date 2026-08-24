import { env, isProd } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * SMS delivery.
 *
 * Three transports behind one function. The provider is chosen by config, so
 * moving from "print it to the log" to a real gateway is an environment change
 * and a redeploy — no code edit, no branch in the caller.
 *
 * Every transport resolves to { delivered, channel }. Delivery failure is
 * reported, never thrown: a gateway outage must not turn into a 500 on a login
 * attempt, and the code is already stored, so a retry can still succeed.
 */

const transports = {
  /**
   * No gateway configured. The code goes to the server log, which the operator
   * can read from their platform's log stream. This keeps a fresh deployment
   * genuinely usable instead of appearing to send messages into a void.
   */
  async log(phone, message) {
    logger.warn(`SMS (no provider configured) → ${phone}: ${message}`);
    return { delivered: true, channel: 'log' };
  },

  async msg91(phone, message) {
    const { authKey, templateId } = env.sms.msg91;
    if (!authKey) return { delivered: false, channel: 'msg91', error: 'MSG91_AUTH_KEY is not set' };

    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        sender: env.sms.senderId,
        short_url: '0',
        mobiles: `91${phone}`,
        message,
      }),
    });

    if (!res.ok) {
      return { delivered: false, channel: 'msg91', error: `HTTP ${res.status}` };
    }
    return { delivered: true, channel: 'msg91' };
  },

  async twilio(phone, message) {
    const { accountSid, authToken, from } = env.sms.twilio;
    if (!accountSid || !authToken) {
      return { delivered: false, channel: 'twilio', error: 'Twilio credentials are not set' };
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `+91${phone}`, From: from, Body: message }),
      },
    );

    if (!res.ok) {
      return { delivered: false, channel: 'twilio', error: `HTTP ${res.status}` };
    }
    return { delivered: true, channel: 'twilio' };
  },
};

export async function sendSms(phone, message) {
  const transport = transports[env.sms.provider] || transports.log;

  try {
    const result = await transport(phone, message);
    if (!result.delivered) {
      logger.error(`SMS to ${phone} failed via ${result.channel}: ${result.error}`);
    }
    return result;
  } catch (err) {
    logger.error(`SMS to ${phone} threw via ${env.sms.provider}: ${err.message}`);
    return { delivered: false, channel: env.sms.provider, error: err.message };
  }
}

/** Warn once at boot if production is running without a real gateway. */
export function warnIfNoSmsProvider() {
  if (isProd && env.sms.provider === 'log') {
    logger.warn(
      'no SMS provider configured — login codes are written to this log only. Set SMS_PROVIDER (msg91 or twilio) before real users sign in.',
    );
  }
}
