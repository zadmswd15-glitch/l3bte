import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  MessageSquare,
  Phone,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  CHAT_CONSOLE_CONFIG_URL,
  ChatMessage,
  ChatSpace,
  FormQuestionSummary,
  createPsychologicalIntakeForm,
  listChatMessages,
  listChatSpaces,
  readFormAndResponses,
  sendChatMessage,
} from '../lib/workspaceApi';
import { ConfirmActionModal } from './ConfirmActionModal';

export interface TwilioConfigState {
  accountSid: string;
  authToken: string;
  twilioNumber: string;
  playerNumber: string;
  verified: boolean;
}

interface TwilioSetupModalProps {
  open: boolean;
  sessionId: string;
  config: TwilioConfigState;
  onChangeConfig: (next: TwilioConfigState) => void;
  onClose: () => void;
  onStartAfterSetup: () => void;
  // Workspace props
  workspaceUser: User | null;
  workspaceToken: string | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  selectedChatSpace: string;
  onSelectChatSpace: (spaceName: string) => void;
  chatAutoEnabled: boolean;
  onToggleChatAuto: (enabled: boolean) => void;
  intakeForm: FormQuestionSummary | null;
  onUpdateIntakeForm: (form: FormQuestionSummary | null) => void;
}

export const TwilioSetupModal: React.FC<TwilioSetupModalProps> = ({
  open,
  sessionId,
  config,
  onChangeConfig,
  onClose,
  onStartAfterSetup,
  workspaceUser,
  workspaceToken,
  onGoogleSignIn,
  onGoogleSignOut,
  selectedChatSpace,
  onSelectChatSpace,
  chatAutoEnabled,
  onToggleChatAuto,
  intakeForm,
  onUpdateIntakeForm,
}) => {
  const [activeTab, setActiveTab] = useState<'twilio' | 'workspace'>('twilio');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Google Workspace states
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [needsChatAppSetup, setNeedsChatAppSetup] = useState(false);
  const [spaces, setSpaces] = useState<ChatSpace[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatCompose, setChatCompose] = useState('');
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [formIdInput, setFormIdInput] = useState(intakeForm?.formId || '');
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    details?: string;
    confirmLabel: string;
    action: () => Promise<void>;
  } | null>(null);

  if (!open) return null;

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/twilio/webhook`
      : '/api/twilio/webhook';

  const handleSaveSession = async (nextConfig: TwilioConfigState) => {
    onChangeConfig(nextConfig);
    await fetch('/api/twilio/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        accountSid: nextConfig.accountSid,
        authToken: nextConfig.authToken,
        twilioNumber: nextConfig.twilioNumber,
        playerNumber: nextConfig.playerNumber,
      }),
    }).catch(() => undefined);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/twilio/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accountSid: config.accountSid,
          authToken: config.authToken,
          twilioNumber: config.twilioNumber,
          playerNumber: config.playerNumber,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const verifiedCfg = { ...config, verified: true };
        onChangeConfig(verifiedCfg);
        setTestResult({
          ok: true,
          message: `تم إرسال رسالة SMS تجريبية بنجاح إلى هاتفك (${data.messageSid}). تحقق من رسائلك الآن!`,
        });
      } else {
        onChangeConfig({ ...config, verified: false });
        setTestResult({
          ok: false,
          message: data.userMessage || 'تعذر التحقق من الاتصال بـ Twilio.',
        });
      }
    } catch {
      setTestResult({
        ok: false,
        message: 'تعذر الاتصال بخادم اللعبة المحلي لإرسال الرسالة التجريبية.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  const handleFetchSpaces = async () => {
    if (!workspaceToken) return;
    setWsLoading(true);
    setWsError(null);
    setNeedsChatAppSetup(false);
    const result = await listChatSpaces(workspaceToken);
    setWsLoading(false);
    if (result.error) {
      setWsError(result.error);
      setNeedsChatAppSetup(Boolean(result.needsChatAppSetup));
      return;
    }
    setSpaces(result.spaces);
    if (result.spaces.length > 0 && !selectedChatSpace) {
      onSelectChatSpace(result.spaces[0].name);
    }
  };

  const handleLoadChatMessages = async (spaceOverride?: string) => {
    const target = (spaceOverride ?? selectedChatSpace).trim();
    if (!workspaceToken || !target) return;
    setWsLoading(true);
    setWsError(null);
    const res = await listChatMessages(workspaceToken, target);
    setWsLoading(false);
    if (res.error) {
      setWsError(res.error);
      setNeedsChatAppSetup(Boolean(res.needsChatAppSetup));
      return;
    }
    setChatMessages(res.messages);
  };

  const requestSendCustomChat = (messageText: string) => {
    if (!workspaceToken || !selectedChatSpace || !messageText.trim()) return;
    const targetSpace = spaces.find((s) => s.name === selectedChatSpace);
    const spaceLabel = targetSpace?.displayName || selectedChatSpace;
    const body = messageText.trim();

    setConfirmState({
      open: true,
      title: 'تأكيد الإرسال إلى Google Chat',
      description: `هل توافق على إرسال هذه الرسالة إلى مساحة "${spaceLabel}"؟`,
      details: body,
      confirmLabel: 'تأكيد وإرسال الرسالة',
      action: async () => {
        setWsLoading(true);
        setWsError(null);
        setChatNotice(null);
        const res = await sendChatMessage(workspaceToken, selectedChatSpace, body);
        setWsLoading(false);
        if (!res.ok) {
          setWsError(res.error || 'تعذر إرسال الرسالة.');
          setNeedsChatAppSetup(Boolean(res.needsChatAppSetup));
        } else {
          setChatNotice('تم إرسال الرسالة إلى Google Chat بنجاح.');
          setChatCompose('');
          await handleLoadChatMessages(selectedChatSpace);
        }
      },
    });
  };

  const requestToggleAutoChat = () => {
    if (chatAutoEnabled) {
      onToggleChatAuto(false);
      return;
    }
    if (!selectedChatSpace) return;
    const targetSpace = spaces.find((s) => s.name === selectedChatSpace);
    const spaceLabel = targetSpace?.displayName || selectedChatSpace;
    setConfirmState({
      open: true,
      title: 'تأكيد المراسلة التلقائية عبر Google Chat',
      description: `عند التفعيل، سترسل اللعبة رسائل الرعب الخمس تلقائياً أثناء اللعب إلى مساحة "${spaceLabel}"، وستقرأ ردودك (مثل كلمة «افتح») من هاتفك عبر Google Chat.`,
      confirmLabel: 'تفعيل المراسلة عبر Chat',
      action: async () => {
        onToggleChatAuto(true);
        setChatNotice('تم تفعيل المراسلة الثنائية عبر Google Chat لهذه الجلسة.');
      },
    });
  };

  const requestCreateIntakeForm = () => {
    if (!workspaceToken) return;
    setConfirmState({
      open: true,
      title: 'تأكيد إنشاء نموذج Google Form جديد',
      description:
        'سيتم إنشاء نموذج تقييم نفسي جديد داخل حسابك على Google Forms بعنوان "ملف التقييم النفسي — الغرفة السابعة" مع 3 أسئلة تفاعلية.',
      confirmLabel: 'إنشاء النموذج الآن',
      action: async () => {
        setWsLoading(true);
        setWsError(null);
        const res = await createPsychologicalIntakeForm(workspaceToken);
        setWsLoading(false);
        if (!res.ok || !res.form) {
          setWsError(res.error || 'تعذر إنشاء النموذج.');
          return;
        }
        onUpdateIntakeForm(res.form);
        setFormIdInput(res.form.formId);
      },
    });
  };

  const handleLoadFormResponses = async () => {
    if (!workspaceToken) return;
    setWsLoading(true);
    setWsError(null);
    const res = await readFormAndResponses(workspaceToken, formIdInput);
    setWsLoading(false);
    if (!res.ok || !res.form) {
      setWsError(res.error || 'تعذر قراءة النموذج والردود.');
      return;
    }
    onUpdateIntakeForm(res.form);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[#242732] bg-[#0B0C10] text-[#E6E2DC] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E212B] px-6 py-4">
          <div>
            <h2 id="setup-modal-title" className="font-display-horror text-2xl font-bold text-white">
              إعدادات الاتصال وكسر الجدار الرابع
            </h2>
            <p className="mt-0.5 text-xs text-[#8E929E]">
              تُحفظ بيانات حسابك في الذاكرة المؤقتة طوال الجلسة فقط ولا تُخزّن على القرص.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-[#8E929E] transition-colors hover:bg-[#161922] hover:text-white"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented Tabs */}
        <div className="flex items-center gap-2 border-b border-[#1E212B] bg-[#090A0D] px-6 py-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('twilio')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'twilio'
                ? 'bg-[#1C1F2A] text-white'
                : 'text-[#8E929E] hover:text-[#D5D8E0]'
            }`}
          >
            <Phone className="h-3.5 w-3.5" />
            ربط الهاتف (Twilio SMS)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'workspace'
                ? 'bg-[#1C1F2A] text-white'
                : 'text-[#8E929E] hover:text-[#D5D8E0]'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Google Chat & Forms
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {activeTab === 'twilio' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#B8BCC7]">Account SID</span>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={config.accountSid}
                    onChange={(e) =>
                      void handleSaveSession({ ...config, accountSid: e.target.value, verified: false })
                    }
                    className="font-mono-code w-full rounded-md border border-[#232631] bg-[#11131A] px-3 py-2.5 text-sm text-white placeholder-[#505564] focus:border-[#9E1B24] focus:outline-none"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#B8BCC7]">Auth Token</span>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      dir="ltr"
                      placeholder="••••••••••••••••••••••••••••••••"
                      value={config.authToken}
                      onChange={(e) =>
                        void handleSaveSession({ ...config, authToken: e.target.value, verified: false })
                      }
                      className="font-mono-code w-full rounded-md border border-[#232631] bg-[#11131A] py-2.5 pr-3 pl-9 text-sm text-white placeholder-[#505564] focus:border-[#9E1B24] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((s) => !s)}
                      className="absolute inset-y-0 left-2 flex items-center text-[#7E8494] hover:text-white"
                      aria-label={showToken ? 'إخفاء الرمز' : 'إظهار الرمز'}
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#B8BCC7]">Twilio Phone Number</span>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="+14155552671"
                    value={config.twilioNumber}
                    onChange={(e) =>
                      void handleSaveSession({ ...config, twilioNumber: e.target.value, verified: false })
                    }
                    className="font-mono-code w-full rounded-md border border-[#232631] bg-[#11131A] px-3 py-2.5 text-sm text-white placeholder-[#505564] focus:border-[#9E1B24] focus:outline-none"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#B8BCC7]">رقم هاتفك الشخصي الحقيقي</span>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="+966501234567"
                    value={config.playerNumber}
                    onChange={(e) =>
                      void handleSaveSession({ ...config, playerNumber: e.target.value, verified: false })
                    }
                    className="font-mono-code w-full rounded-md border border-[#232631] bg-[#11131A] px-3 py-2.5 text-sm text-white placeholder-[#505564] focus:border-[#9E1B24] focus:outline-none"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={testing}
                  onClick={handleTestConnection}
                  className="flex items-center gap-2 rounded-md bg-[#9E1B24] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B8222D] disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Send className="h-4 w-4" />
                  {testing ? 'جاري إرسال SMS تجريبية...' : 'اختبار الاتصال'}
                </button>
                <span className="text-xs text-[#8E929E]">
                  يرسل رسالة نصية مرعبة لهاتفك للتأكد من صحة بيانات الحساب التجريبي (Trial).
                </span>
              </div>

              {testResult && (
                <div
                  className={`flex items-start gap-3 rounded-md border p-3.5 text-sm ${
                    testResult.ok
                      ? 'border-[#1E563B] bg-[#0B2217] text-[#86EFAC]'
                      : 'border-[#5C1F25] bg-[#1F0B0E] text-[#FCA5A5]'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <p className="leading-relaxed">{testResult.message}</p>
                </div>
              )}

              {/* Webhook Info Box */}
              <div className="space-y-2.5 rounded-md border border-[#1E212B] bg-[#090A0D] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#D6B26E]">
                    استقبال ردودك من الهاتف (Twilio Webhook)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyWebhook}
                    className="flex items-center gap-1.5 rounded border border-[#262934] bg-[#13151D] px-2.5 py-1 text-xs text-[#C8CBD4] hover:text-white whitespace-nowrap shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedWebhook ? 'تم النسخ' : 'نسخ الرابط'}
                  </button>
                </div>
                <div dir="ltr" className="font-mono-code overflow-x-auto rounded bg-[#11131A] px-3 py-2 text-xs text-[#A5B4FC]">
                  {webhookUrl}
                </div>
                <p className="text-xs leading-relaxed text-[#8E929E]">
                  ألصق هذا الرابط في لوحة Twilio داخل إعدادات الرقم (Messaging → A message comes in → HTTP POST). وعند الرد بكلمة{' '}
                  <strong className="text-[#E6E2DC]">افتح</strong> ستتفاعل اللعبة مباشرة وتفتح الباب الفولاذي.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-5">
              {/* Google Sign-In Status */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[#1E212B] bg-[#090A0D] p-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">حساب Google Workspace</h3>
                  <p className="mt-1 text-xs text-[#8E929E]">
                    {workspaceUser
                      ? `متصل بالحساب: ${workspaceUser.email || workspaceUser.displayName}`
                      : 'سجّل الدخول لربط مساحات Google Chat ونماذج التقييم النفسي Google Forms مع أحداث اللعبة.'}
                  </p>
                </div>

                {workspaceUser && workspaceToken ? (
                  <button
                    type="button"
                    onClick={() => void onGoogleSignOut()}
                    className="rounded-md border border-[#2B2E3A] bg-[#161922] px-4 py-2 text-xs font-semibold text-[#E5E7EB] hover:bg-[#1E222E] whitespace-nowrap shrink-0"
                  >
                    تسجيل الخروج
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onGoogleSignIn()}
                    className="inline-flex items-center gap-2.5 rounded-md border border-[#747775] bg-white px-4 py-2 text-sm font-medium text-[#1F1F1F] transition-colors hover:bg-[#F3F4F6] whitespace-nowrap shrink-0"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                    Sign in with Google
                  </button>
                )}
              </div>

              {wsError && (
                <div className="space-y-2 rounded-md border border-[#5C1F25] bg-[#1F0B0E] p-3.5 text-xs text-[#FCA5A5]">
                  <p className="leading-relaxed">{wsError}</p>
                  {needsChatAppSetup && (
                    <a
                      href={CHAT_CONSOLE_CONFIG_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-white underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      فتح صفحة إعداد Google Chat App في Cloud Console
                    </a>
                  )}
                </div>
              )}

              {chatNotice && (
                <div className="rounded-md border border-[#1E563B] bg-[#0B2217] p-3 text-xs text-[#86EFAC]">
                  {chatNotice}
                </div>
              )}

              {/* Google Chat Section */}
              <div className="space-y-3 rounded-md border border-[#1E212B] bg-[#090A0D] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-white">المراسلة الثنائية عبر Google Chat</h4>
                    <p className="text-xs text-[#8E929E]">
                      أرسل واستقبل الرسائل بين اللعبة وتطبيق Google Chat على هاتفك (يتطلب حساب Google Workspace وتفعيل Chat App في Cloud Console).
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!workspaceToken || wsLoading}
                    onClick={() => void handleFetchSpaces()}
                    className="rounded-md border border-[#2B2E3A] bg-[#141720] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E222E] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    جلب المساحات
                  </button>
                </div>

                {spaces.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedChatSpace}
                      onChange={(e) => onSelectChatSpace(e.target.value)}
                      className="min-w-[200px] flex-1 rounded-md border border-[#232631] bg-[#11131A] px-3 py-2 text-xs text-white"
                    >
                      {spaces.map((sp) => (
                        <option key={sp.name} value={sp.name}>
                          {sp.displayName || sp.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedChatSpace || wsLoading}
                      onClick={() => void handleLoadChatMessages()}
                      className="rounded-md border border-[#2B2E3A] bg-[#141720] px-3 py-2 text-xs font-semibold text-[#C8CBD4] hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      تحديث المحادثة
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="أو أدخل معرّف المساحة مباشرة (مثال: spaces/AAAAxxxxxxx)"
                    value={selectedChatSpace}
                    onChange={(e) => onSelectChatSpace(e.target.value)}
                    className="font-mono-code w-full rounded-md border border-[#232631] bg-[#11131A] px-3 py-2 text-xs text-white placeholder-[#505564]"
                  />
                )}

                {selectedChatSpace && (
                  <div className="space-y-3 border-t border-[#1B1E28] pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={wsLoading}
                        onClick={() =>
                          requestSendCustomChat(
                            'تنبيه الغرفة السابعة: تم ربط هذه المساحة بجلسة اللعب. ردّ بكلمة «افتح» عند العثور على المفتاح.'
                          )
                        }
                        className="rounded-md bg-[#1D2330] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#273042] disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        إرسال رسالة اختبار إلى Chat
                      </button>

                      <button
                        type="button"
                        onClick={requestToggleAutoChat}
                        className={`rounded-md border px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                          chatAutoEnabled
                            ? 'border-[#1E563B] bg-[#0B2217] text-[#86EFAC]'
                            : 'border-[#2B2E3A] bg-[#141720] text-[#D6B26E] hover:text-white'
                        }`}
                      >
                        {chatAutoEnabled
                          ? 'المراسلة التلقائية مع Chat مفعّلة ✓'
                          : 'تفعيل إرسال أحداث الرعب إلى Chat'}
                      </button>
                    </div>

                    {/* Compose direct message to Google Chat */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="اكتب رسالة لإرسالها مباشرة إلى Google Chat..."
                        value={chatCompose}
                        onChange={(e) => setChatCompose(e.target.value)}
                        className="min-w-[180px] flex-1 rounded-md border border-[#232631] bg-[#11131A] px-3 py-2 text-xs text-white placeholder-[#505564]"
                      />
                      <button
                        type="button"
                        disabled={!workspaceToken || !chatCompose.trim() || wsLoading}
                        onClick={() => requestSendCustomChat(chatCompose)}
                        className="rounded-md bg-[#9E1B24] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#B8222D] disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        إرسال
                      </button>
                    </div>

                    {/* Recent Messages Thread */}
                    {chatMessages.length > 0 && (
                      <div className="max-h-36 space-y-1.5 overflow-y-auto rounded border border-[#1E212B] bg-[#06070A] p-2.5 text-xs">
                        {chatMessages.map((msg) => (
                          <div key={msg.name} className="leading-relaxed">
                            <span className="font-semibold text-[#D6B26E]">
                              {msg.sender?.displayName || 'مشارك'}:{' '}
                            </span>
                            <span className="text-[#E6E2DC]">{msg.text || ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Google Forms Section */}
              <div className="space-y-3 rounded-md border border-[#1E212B] bg-[#090A0D] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-white">استبيان التقييم النفسي (Google Forms)</h4>
                    <p className="text-xs text-[#8E929E]">
                      أنشئ نموذجاً حقيقياً أو اقرأ إجابات اللاعبين لإدراج مخاوفهم داخل اللعبة.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!workspaceToken || wsLoading}
                    onClick={requestCreateIntakeForm}
                    className="flex items-center gap-1.5 rounded-md bg-[#1D2330] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#273042] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    إنشاء نموذج نفسي جديد
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="أدخل Form ID لقراءة الردود..."
                    value={formIdInput}
                    onChange={(e) => setFormIdInput(e.target.value)}
                    className="font-mono-code min-w-[200px] flex-1 rounded-md border border-[#232631] bg-[#11131A] px-3 py-2 text-xs text-white placeholder-[#505564]"
                  />
                  <button
                    type="button"
                    disabled={!workspaceToken || !formIdInput.trim() || wsLoading}
                    onClick={() => void handleLoadFormResponses()}
                    className="rounded-md border border-[#2B2E3A] bg-[#141720] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1E222E] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    قراءة الردود
                  </button>
                </div>

                {intakeForm && (
                  <div className="space-y-2 rounded border border-[#222530] bg-[#11131A] p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#D6B26E]">{intakeForm.title}</span>
                      {intakeForm.responderUri && (
                        <a
                          href={intakeForm.responderUri}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#93C5FD] underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          فتح رابط تعبئة النموذج
                        </a>
                      )}
                    </div>
                    <p className="text-[#9CA1AE]">
                      عدد الردود المسترجعة: <span className="font-mono-code text-white">{intakeForm.responses.length}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1E212B] bg-[#090A0D] px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-[#8E929E]">
            <KeyRound className="h-3.5 w-3.5 text-[#D6B26E]" />
            <span>
              {config.verified
                ? 'ربط Twilio موثّق وجاهز للعب'
                : 'يمكنك التجربة مباشرة أو حفظ بيانات Twilio أولاً'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#2A2D38] bg-[#141720] px-4 py-2 text-sm font-medium text-[#D1D5DB] hover:bg-[#1C202C] whitespace-nowrap shrink-0"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSaveSession(config);
                onStartAfterSetup();
              }}
              className="rounded-md bg-[#9E1B24] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B8222D] whitespace-nowrap shrink-0"
            >
              حفظ وبدء اللعب
            </button>
          </div>
        </div>
      </div>

      {confirmState && (
        <ConfirmActionModal
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          details={confirmState.details}
          confirmLabel={confirmState.confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            const run = confirmState.action;
            setConfirmState(null);
            void run();
          }}
        />
      )}
    </div>
  );
};
