import firebaseConfig from '../../firebase-applet-config.json';

export interface ChatSpace {
  name: string;
  displayName?: string;
  spaceType?: string;
}

export interface ChatMessage {
  name: string;
  text?: string;
  createTime?: string;
  sender?: {
    displayName?: string;
    type?: string;
  };
}

export interface FormQuestionSummary {
  formId: string;
  title: string;
  responderUri?: string;
  responses: Array<{
    responseId: string;
    answersText: string[];
    submittedAt?: string;
  }>;
}

export const CHAT_CONSOLE_CONFIG_URL = `https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=${firebaseConfig.projectId}`;

export async function listChatSpaces(accessToken: string): Promise<{
  spaces: ChatSpace[];
  needsChatAppSetup?: boolean;
  error?: string;
}> {
  const res = await fetch('https://chat.googleapis.com/v1/spaces', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(data?.error?.message || '');
    if (res.status === 404 || message.toLowerCase().includes('chat app not found')) {
      return {
        spaces: [],
        needsChatAppSetup: true,
        error:
          'Google Chat app not found. To create a Chat app, you must turn on the Chat API and configure the app in the Google Cloud console.',
      };
    }
    return {
      spaces: [],
      error: message || `تعذر جلب مساحات Google Chat (${res.status}).`,
    };
  }
  return { spaces: Array.isArray(data.spaces) ? data.spaces : [] };
}

export async function listChatMessages(
  accessToken: string,
  spaceName: string
): Promise<{
  messages: ChatMessage[];
  error?: string;
  needsChatAppSetup?: boolean;
}> {
  const safeSpace = spaceName.trim();
  const res = await fetch(
    `https://chat.googleapis.com/v1/${safeSpace}/messages?pageSize=15&orderBy=createTime%20desc`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(data?.error?.message || '');
    const is404 = res.status === 404 || message.toLowerCase().includes('chat app not found');
    return {
      messages: [],
      needsChatAppSetup: is404,
      error: is404
        ? 'Google Chat app not found. To create a Chat app, you must turn on the Chat API and configure the app in the Google Cloud console.'
        : message || `تعذر قراءة رسائل Google Chat (${res.status}).`,
    };
  }
  const list: ChatMessage[] = Array.isArray(data.messages) ? data.messages : [];
  return { messages: list.slice().reverse() };
}

export async function sendChatMessage(
  accessToken: string,
  spaceName: string,
  text: string
): Promise<{ ok: boolean; error?: string; needsChatAppSetup?: boolean }> {
  const safeSpace = spaceName.trim();
  const res = await fetch(`https://chat.googleapis.com/v1/${safeSpace}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(data?.error?.message || '');
    const is404 = res.status === 404 || message.toLowerCase().includes('chat app not found');
    return {
      ok: false,
      needsChatAppSetup: is404,
      error: is404
        ? 'Google Chat app not found. To create a Chat app, you must turn on the Chat API and configure the app in the Google Cloud console.'
        : message || `تعذر الإرسال إلى Google Chat (${res.status})`,
    };
  }
  return { ok: true };
}

export async function createPsychologicalIntakeForm(
  accessToken: string
): Promise<{ ok: boolean; form?: FormQuestionSummary; error?: string }> {
  const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: 'ملف التقييم النفسي — الغرفة السابعة (Echo: Room 07)',
        documentTitle: 'Echo Room 07 Psychological Intake',
      },
    }),
  });

  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !created.formId) {
    return {
      ok: false,
      error: created?.error?.message || `تعذر إنشاء نموذج Google Forms (${createRes.status}).`,
    };
  }

  const safeFormId = encodeURIComponent(String(created.formId).trim());
  const batchRes = await fetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            createItem: {
              item: {
                title: 'ما الاسم الذي تفضّل أن يناديك به الكيان في الظلام؟',
                questionItem: {
                  question: {
                    required: true,
                    textQuestion: { paragraph: false },
                  },
                },
              },
              location: { index: 0 },
            },
          },
          {
            createItem: {
              item: {
                title: 'ما أكثر صوت يثير توترك عندما تكون وحدك في الغرفة ليلاً؟',
                questionItem: {
                  question: {
                    required: true,
                    textQuestion: { paragraph: false },
                  },
                },
              },
              location: { index: 1 },
            },
          },
          {
            createItem: {
              item: {
                title: 'هل أنت مستعد لكسر الجدار الرابع وربط هذه الجلسة بهاتفك؟',
                questionItem: {
                  question: {
                    required: true,
                    choiceQuestion: {
                      type: 'RADIO',
                      options: [{ value: 'نعم، افتح البوابة' }, { value: 'أنا متردد لكني سأدخل' }],
                    },
                  },
                },
              },
              location: { index: 2 },
            },
          },
        ],
      }),
    }
  );

  if (!batchRes.ok) {
    const errData = await batchRes.json().catch(() => ({}));
    return {
      ok: false,
      error: errData?.error?.message || 'تم إنشاء النموذج لكن تعذر إضافة الأسئلة.',
    };
  }

  return {
    ok: true,
    form: {
      formId: created.formId,
      title: created.info?.title || 'ملف التقييم النفسي — الغرفة السابعة',
      responderUri: created.responderUri,
      responses: [],
    },
  };
}

export async function readFormAndResponses(
  accessToken: string,
  formId: string
): Promise<{ ok: boolean; form?: FormQuestionSummary; error?: string }> {
  const safeFormId = encodeURIComponent(formId.trim());
  if (!safeFormId) {
    return { ok: false, error: 'أدخل معرّف النموذج (Form ID) أولاً.' };
  }

  const formRes = await fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const formData = await formRes.json().catch(() => ({}));
  if (!formRes.ok) {
    return {
      ok: false,
      error: formData?.error?.message || `تعذر قراءة النموذج (${formRes.status}).`,
    };
  }

  const respRes = await fetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}/responses`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const respData = await respRes.json().catch(() => ({}));
  const rawResponses = Array.isArray(respData.responses) ? respData.responses : [];

  const parsedResponses = rawResponses.map((r: Record<string, unknown>) => {
    const answersObj = (r.answers as Record<string, { textAnswers?: { answers?: Array<{ value?: string }> } }>) || {};
    const answersText: string[] = [];
    for (const ans of Object.values(answersObj)) {
      const vals = ans?.textAnswers?.answers ?? [];
      for (const v of vals) {
        if (v.value) answersText.push(v.value);
      }
    }
    return {
      responseId: String(r.responseId || ''),
      answersText,
      submittedAt: r.lastSubmittedTime ? String(r.lastSubmittedTime) : undefined,
    };
  });

  return {
    ok: true,
    form: {
      formId: formData.formId || formId.trim(),
      title: formData.info?.title || 'نموذج Google Form',
      responderUri: formData.responderUri,
      responses: parsedResponses,
    },
  };
}
