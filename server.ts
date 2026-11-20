import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  twilioNumber: string;
  playerNumber: string;
}

interface IncomingReply {
  id: string;
  body: string;
  normalized: string;
  command: 'OPEN_DOOR' | 'TOGGLE_LIGHT' | 'TAUNT' | 'HELP' | 'UNKNOWN';
  from: string;
  receivedAt: string;
  simulated?: boolean;
}

interface SessionState {
  credentials: TwilioCredentials;
  incomingQueue: IncomingReply[];
  updatedAt: number;
}

// Strict in-memory session storage (never persisted to disk)
const sessions = new Map<string, SessionState>();
let latestActiveSessionId: string | null = null;

function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s()-]/g, '');
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

function parseArabicCommand(rawBody: string): IncomingReply['command'] {
  const text = rawBody.trim().toLowerCase();
  if (
    text.includes('افتح') ||
    text.includes('إفتح') ||
    text.includes('فتح') ||
    text.includes('open') ||
    text.includes('unlock')
  ) {
    return 'OPEN_DOOR';
  }
  if (
    text.includes('نور') ||
    text.includes('ضوء') ||
    text.includes('شغل') ||
    text.includes('light') ||
    text.includes('power')
  ) {
    return 'TOGGLE_LIGHT';
  }
  if (
    text.includes('اهرب') ||
    text.includes('مساعدة') ||
    text.includes('help') ||
    text.includes('run')
  ) {
    return 'HELP';
  }
  if (text.includes('نعم') || text.includes('لا') || text.includes('من أنت')) {
    return 'TAUNT';
  }
  return 'UNKNOWN';
}

function mapTwilioError(status: number, data: { code?: number; message?: string }): {
  userMessage: string;
  errorCode: number | string;
} {
  const code = data?.code ?? status;
  switch (code) {
    case 20003:
      return {
        errorCode: 20003,
        userMessage:
          'فشل المصادقة (20003): تأكد من صحة Account SID و Auth Token من لوحة تحكم Twilio.',
      };
    case 21608:
      return {
        errorCode: 21608,
        userMessage:
          'حساب تجريبي غير موثّق (21608): في حساب Twilio Trial يجب أولاً توثيق رقم هاتفك الشخصي داخل Verified Caller IDs.',
      };
    case 21211:
    case 21212:
      return {
        errorCode: code,
        userMessage:
          `صيغة رقم الهاتف غير صالحة (${code}): تأكد من كتابة رمز الدولة بصيغة E.164 مثل +966501234567.`,
      };
    case 21606:
      return {
        errorCode: 21606,
        userMessage:
          'رقم Twilio غير مفعّل لإرسال رسائل SMS (21606): استخدم رقم Twilio يدعم الرسائل النصية.',
      };
    case 20005:
    case 21610:
    case 20008:
    case 402:
    case 429:
      return {
        errorCode: code,
        userMessage:
          `تعذر الإرسال بسبب رصيد الحساب التجريبي أو القيود (${code}): تحقق من رصيدك المجاني في Twilio أو حالة الحساب.`,
      };
    default:
      return {
        errorCode: code,
        userMessage: `خطأ من Twilio (${code}): ${data?.message || 'تعذر إرسال الرسالة النصية.'}`,
      };
  }
}

async function dispatchTwilioSms(creds: TwilioCredentials, body: string) {
  const sid = creds.accountSid.trim();
  const token = creds.authToken.trim();
  const from = normalizePhone(creds.twilioNumber);
  const to = normalizePhone(creds.playerNumber);

  if (!sid.startsWith('AC') || sid.length < 30 || !token) {
    return {
      ok: false,
      status: 400,
      errorCode: 'INVALID_CREDENTIALS_FORMAT',
      userMessage: 'يجب أن يبدأ Account SID بـ AC وأن يتم إدخال Auth Token بشكل صحيح.',
    };
  }

  if (!isValidE164(from) || !isValidE164(to)) {
    return {
      ok: false,
      status: 400,
      errorCode: 'INVALID_PHONE_FORMAT',
      userMessage: 'تأكد من كتابة رقم Twilio ورقمك الشخصي بالصيغة الدولية E.164 (مثال: +14155552671).',
    };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const data = (await response.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      code?: number;
      message?: string;
    };

    if (!response.ok) {
      const mapped = mapTwilioError(response.status, data);
      return {
        ok: false,
        status: response.status,
        errorCode: mapped.errorCode,
        userMessage: mapped.userMessage,
        rawMessage: data?.message,
      };
    }

    return {
      ok: true,
      status: 200,
      messageSid: data.sid,
      twilioStatus: data.status,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      errorCode: 'NETWORK_ERROR',
      userMessage:
        err instanceof Error
          ? `تعذر الاتصال بخوادم Twilio: ${err.message}`
          : 'حدث خطأ في الشبكة أثناء الاتصال بخدمة Twilio.',
    };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.post('/api/twilio/session', (req, res) => {
    const { sessionId, accountSid, authToken, twilioNumber, playerNumber } = req.body ?? {};
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ ok: false, userMessage: 'معرّف الجلسة مفقود.' });
      return;
    }

    const creds: TwilioCredentials = {
      accountSid: String(accountSid ?? '').trim(),
      authToken: String(authToken ?? '').trim(),
      twilioNumber: normalizePhone(String(twilioNumber ?? '')),
      playerNumber: normalizePhone(String(playerNumber ?? '')),
    };

    const existing = sessions.get(sessionId);
    sessions.set(sessionId, {
      credentials: creds,
      incomingQueue: existing?.incomingQueue ?? [],
      updatedAt: Date.now(),
    });
    latestActiveSessionId = sessionId;

    res.json({ ok: true, savedInMemory: true });
  });

  app.post('/api/twilio/test', async (req, res) => {
    const { sessionId, accountSid, authToken, twilioNumber, playerNumber } = req.body ?? {};
    const creds: TwilioCredentials = {
      accountSid: String(accountSid ?? '').trim(),
      authToken: String(authToken ?? '').trim(),
      twilioNumber: normalizePhone(String(twilioNumber ?? '')),
      playerNumber: normalizePhone(String(playerNumber ?? '')),
    };

    if (sessionId && typeof sessionId === 'string') {
      const existing = sessions.get(sessionId);
      sessions.set(sessionId, {
        credentials: creds,
        incomingQueue: existing?.incomingQueue ?? [],
        updatedAt: Date.now(),
      });
      latestActiveSessionId = sessionId;
    }

    const testBody =
      'تجربة اتصال الغرفة السابعة... الآن أستطيع الوصول إلى هاتفك الحقيقي. لا تغلق الشاشة.';
    const result = await dispatchTwilioSms(creds, testBody);
    res.status(result.ok ? 200 : result.status).json(result);
  });

  app.post('/api/twilio/send', async (req, res) => {
    const { sessionId, message, credentials } = req.body ?? {};
    const session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
    const creds: TwilioCredentials | undefined = credentials?.accountSid
      ? {
          accountSid: String(credentials.accountSid).trim(),
          authToken: String(credentials.authToken).trim(),
          twilioNumber: normalizePhone(String(credentials.twilioNumber)),
          playerNumber: normalizePhone(String(credentials.playerNumber)),
        }
      : session?.credentials;

    if (!creds || !creds.accountSid || !creds.authToken) {
      res.status(400).json({
        ok: false,
        userMessage: 'لا توجد بيانات Twilio نشطة في ذاكرة الجلسة.',
      });
      return;
    }

    const text = String(message ?? '').trim();
    if (!text) {
      res.status(400).json({ ok: false, userMessage: 'نص الرسالة فارغ.' });
      return;
    }

    const result = await dispatchTwilioSms(creds, text);
    res.status(result.ok ? 200 : result.status).json(result);
  });

  const handleIncomingWebhook = (req: express.Request, res: express.Response) => {
    const body = String(req.body?.Body ?? '').trim();
    const from = normalizePhone(String(req.body?.From ?? ''));

    if (body) {
      let targetSession: SessionState | undefined;
      for (const [, sess] of sessions.entries()) {
        if (sess.credentials.playerNumber && sess.credentials.playerNumber === from) {
          targetSession = sess;
          break;
        }
      }
      if (!targetSession && latestActiveSessionId) {
        targetSession = sessions.get(latestActiveSessionId);
      }

      if (targetSession) {
        targetSession.incomingQueue.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          body,
          normalized: body.toLowerCase(),
          command: parseArabicCommand(body),
          from: from || 'player-phone',
          receivedAt: new Date().toISOString(),
        });
      }
    }

    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  };

  app.post('/api/twilio/webhook', handleIncomingWebhook);
  app.post('/sms', handleIncomingWebhook);

  app.post('/api/twilio/simulate-reply', (req, res) => {
    const { sessionId, body } = req.body ?? {};
    const text = String(body ?? '').trim();
    if (!sessionId || !text) {
      res.status(400).json({ ok: false });
      return;
    }

    let sess = sessions.get(sessionId);
    if (!sess) {
      sess = {
        credentials: { accountSid: '', authToken: '', twilioNumber: '', playerNumber: 'local-device' },
        incomingQueue: [],
        updatedAt: Date.now(),
      };
      sessions.set(sessionId, sess);
    }

    const item: IncomingReply = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      body: text,
      normalized: text.toLowerCase(),
      command: parseArabicCommand(text),
      from: sess.credentials.playerNumber || 'محاكاة الهاتف',
      receivedAt: new Date().toISOString(),
      simulated: true,
    };
    sess.incomingQueue.push(item);
    res.json({ ok: true, reply: item });
  });

  app.get('/api/twilio/poll', (req, res) => {
    const sessionId = String(req.query.sessionId ?? '');
    if (!sessionId) {
      res.json({ replies: [] });
      return;
    }
    const sess = sessions.get(sessionId);
    if (!sess || sess.incomingQueue.length === 0) {
      res.json({ replies: [] });
      return;
    }
    const replies = [...sess.incomingQueue];
    sess.incomingQueue = [];
    res.json({ replies });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Echo: Room 07 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
