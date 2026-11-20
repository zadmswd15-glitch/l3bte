import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Code2,
  DoorOpen,
  KeyRound,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { HorrorCorridorController, InteractTargetId } from './three/HorrorScene';
import { horrorAudio } from './lib/horrorAudio';
import { HORROR_SMS_MESSAGES, HorrorSmsEvent } from './lib/pythonSuite';
import { TwilioConfigState, TwilioSetupModal } from './components/TwilioSetupModal';
import { PythonSuiteModal } from './components/PythonSuiteModal';
import { ConfirmActionModal } from './components/ConfirmActionModal';
import {
  initWorkspaceAuth,
  logoutWorkspace,
  signInWithGoogleWorkspace,
} from './lib/workspaceAuth';
import {
  FormQuestionSummary,
  listChatMessages,
  sendChatMessage,
} from './lib/workspaceApi';

type GameMode = 'title' | 'playing' | 'paused' | 'victory';

interface FeedMessage {
  id: string;
  direction: 'outgoing' | 'incoming' | 'system';
  text: string;
  channel: string;
  time: string;
}

function makeSessionId(): string {
  return `echo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HorrorCorridorController | null>(null);
  const [sessionId] = useState<string>(() => makeSessionId());

  const [mode, setMode] = useState<GameMode>('title');
  const [hasKey, setHasKey] = useState(false);
  const [doorUnlocked, setDoorUnlocked] = useState(false);
  const [powerOn, setPowerOn] = useState(true);
  const [tension, setTension] = useState(12);
  const [muted, setMuted] = useState(false);

  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<InteractTargetId | null>(null);
  const [narrativeLine, setNarrativeLine] = useState<string>(
    'أنت محاصر في الممر السابع. ابحث عن المفتاح الصدئ على مكتب التحقيق.'
  );
  const [feed, setFeed] = useState<FeedMessage[]>([]);
  const [dockOpen, setDockOpen] = useState(true);
  const [simReplyInput, setSimReplyInput] = useState('');

  const [setupOpen, setSetupOpen] = useState(false);
  const [pythonOpen, setPythonOpen] = useState(false);

  // Twilio credentials strictly in React/Server session memory
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfigState>({
    accountSid: '',
    authToken: '',
    twilioNumber: '',
    playerNumber: '',
    verified: false,
  });

  // Google Workspace state
  const [workspaceUser, setWorkspaceUser] = useState<User | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [selectedChatSpace, setSelectedChatSpace] = useState('');
  const [chatAutoEnabled, setChatAutoEnabled] = useState(false);
  const [intakeForm, setIntakeForm] = useState<FormQuestionSummary | null>(null);
  const [pendingChatConfirm, setPendingChatConfirm] = useState<string | null>(null);

  const sentEventsRef = useRef<Set<HorrorSmsEvent['id']>>(new Set());
  const seenChatMsgNamesRef = useRef<Set<string>>(new Set());
  const chatSeededRef = useRef(false);
  const stateSnapshotRef = useRef({
    mode,
    hasKey,
    doorUnlocked,
    powerOn,
    twilioConfig,
    workspaceToken,
    selectedChatSpace,
    chatAutoEnabled,
    intakeForm,
  });
  stateSnapshotRef.current = {
    mode,
    hasKey,
    doorUnlocked,
    powerOn,
    twilioConfig,
    workspaceToken,
    selectedChatSpace,
    chatAutoEnabled,
    intakeForm,
  };

  const pushFeed = useCallback(
    (direction: FeedMessage['direction'], channel: string, text: string) => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setFeed((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          direction,
          channel,
          text,
          time,
        },
        ...prev.slice(0, 4),
      ]);
    },
    []
  );

  const triggerHorrorSms = useCallback(
    async (eventId: HorrorSmsEvent['id']) => {
      if (sentEventsRef.current.has(eventId)) return;
      sentEventsRef.current.add(eventId);

      const template = HORROR_SMS_MESSAGES.find((m) => m.id === eventId);
      if (!template) return;

      const {
        twilioConfig: cfg,
        intakeForm: form,
        workspaceToken: wsTok,
        selectedChatSpace: chatSpace,
        chatAutoEnabled: chatAuto,
      } = stateSnapshotRef.current;
      let personalizedBody = template.bodyAr;
      const latestAnswer = form?.responses?.[0]?.answersText?.[0];
      if (eventId === 'POWER_OUT' && latestAnswer) {
        personalizedBody = `${template.bodyAr} (${latestAnswer}...)`;
      }

      if (chatAuto && wsTok && chatSpace) {
        void sendChatMessage(wsTok, chatSpace, personalizedBody).then((res) => {
          if (res.ok) {
            pushFeed('outgoing', 'Google Chat (تلقائي)', personalizedBody);
          }
        });
      }

      if (cfg.accountSid && cfg.authToken && cfg.twilioNumber && cfg.playerNumber) {
        try {
          const res = await fetch('/api/twilio/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              message: personalizedBody,
              credentials: cfg,
            }),
          });
          const data = await res.json();
          if (res.ok && data.ok) {
            horrorAudio.playSmsSting();
            pushFeed('outgoing', 'Twilio SMS (حقيقي)', personalizedBody);
            return;
          }
          pushFeed(
            'system',
            'تنبيه Twilio',
            data.userMessage || 'تعذر إرسال SMS عبر Twilio، تم العرض داخل الجلسة.'
          );
        } catch {
          pushFeed('system', 'تنبيه الشبكة', 'تعذر الاتصال بخادم Twilio.');
        }
      }

      // Always show in-game fourth-wall phone alert so gameplay continues smoothly
      horrorAudio.playSmsSting();
      pushFeed('outgoing', 'هاتف الجلسة (محاكاة)', personalizedBody);
    },
    [pushFeed, sessionId]
  );

  const handleInteract = useCallback(
    (target: InteractTargetId) => {
      const snap = stateSnapshotRef.current;
      if (snap.mode !== 'playing') return;

      if (target === 'key') {
        if (!snap.hasKey) {
          setHasKey(true);
          horrorAudio.playKeyPickup();
          setNarrativeLine(
            'التقطتَ المفتاح الصدئ! تحقّق من هاتفك الآن — أرسل كلمة «افتح» لفتح الباب الفولاذي.'
          );
          void triggerHorrorSms('KEY_FOUND');
        }
      } else if (target === 'breaker') {
        const nextPower = !snap.powerOn;
        setPowerOn(nextPower);
        horrorAudio.playFlickerBuzz();
        if (!nextPower) {
          setNarrativeLine('انقطعت الكهرباء! الظلام يبتلع الممر والكيان يتحرك نحوك...');
          void triggerHorrorSms('POWER_OUT');
        } else {
          setNarrativeLine('أعدت تشغيل القاطع الكهربائي. المصابيح ترتعش من جديد.');
        }
      } else if (target === 'phone') {
        horrorAudio.playSmsSting();
        setNarrativeLine(
          snap.twilioConfig.verified
            ? `الهاتف مرتبط بالرقم ${snap.twilioConfig.playerNumber}. ردّ بكلمة «افتح» من هاتفك.`
            : 'هذا الهاتف ينتظر ربط رقمك الحقيقي عبر Twilio (أو استخدم حقل الرد السريع أدناه).'
        );
      } else if (target === 'door') {
        if (!snap.hasKey) {
          setNarrativeLine('الباب الفولاذي مقفل بإحكام. ابحث عن المفتاح الصدئ فوق المكتب أولاً.');
          void triggerHorrorSms('APPROACH');
        } else if (!snap.doorUnlocked) {
          setNarrativeLine(
            'المفتاح وحده لا يكفي! القفل الرقمي ينتظر ردّك عبر رسالة SMS بكلمة: افتح'
          );
          void triggerHorrorSms('HESITATION');
        } else {
          setMode('victory');
          void triggerHorrorSms('ESCAPE');
        }
      }
    },
    [triggerHorrorSms]
  );

  // Initialize Three.js once on mount
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const controller = new HorrorCorridorController(container, {
      onHoverTarget: (target, label) => {
        setHoveredTarget(target);
        setHoverLabel(label);
      },
      onInteract: (target) => {
        handleInteract(target);
      },
      onStateTick: (telemetry) => {
        setTension(telemetry.tension);
        horrorAudio.playHeartbeat(telemetry.tension / 100);

        const snap = stateSnapshotRef.current;
        if (telemetry.entityDistance < 4.4 && snap.mode === 'playing') {
          void triggerHorrorSms('APPROACH');
        }
        if (
          snap.doorUnlocked &&
          telemetry.distanceToDoor < 0.75 &&
          snap.mode === 'playing'
        ) {
          setMode('victory');
          void triggerHorrorSms('ESCAPE');
        }
      },
      onFootstep: () => horrorAudio.playFootstep(),
      onFlickerBuzz: () => horrorAudio.playFlickerBuzz(),
    });

    sceneRef.current = controller;
    return () => {
      controller.dispose();
      sceneRef.current = null;
    };
  }, [handleInteract, triggerHorrorSms]);

  // Sync React state into Three.js controller without re-mounting WebGL
  useEffect(() => {
    sceneRef.current?.setState({
      mode: mode === 'title' ? 'title' : mode === 'playing' ? 'playing' : 'paused',
      hasKey,
      doorUnlocked,
      powerOn,
    });
  }, [mode, hasKey, doorUnlocked, powerOn]);

  // Workspace Auth listener
  useEffect(() => {
    const unsub = initWorkspaceAuth(
      (user, token) => {
        setWorkspaceUser(user);
        setWorkspaceToken(token);
      },
      () => {
        setWorkspaceUser(null);
        setWorkspaceToken(null);
      }
    );
    return () => unsub();
  }, []);

  // Poll incoming Twilio SMS webhooks while playing
  useEffect(() => {
    if (mode !== 'playing') return;
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/twilio/poll?sessionId=${encodeURIComponent(sessionId)}`);
        const data = (await res.json()) as {
          replies?: Array<{ id: string; body: string; command: string; from: string }>;
        };
        if (!data.replies || data.replies.length === 0) return;

        for (const rep of data.replies) {
          horrorAudio.playSmsSting();
          pushFeed('incoming', `رد من ${rep.from}`, rep.body);
          const snap = stateSnapshotRef.current;

          if (rep.command === 'OPEN_DOOR') {
            if (snap.hasKey) {
              setDoorUnlocked(true);
              horrorAudio.playDoorUnlock();
              setNarrativeLine('تم التحقق من رسالتك «افتح»! الباب الفولاذي ينفتح الآن — اهرب للأمام!');
            } else {
              setNarrativeLine('وصلت كلمتك «افتح»، لكنك ما زلت بحاجة لالتقاط المفتاح الصدئ من المكتب!');
            }
          } else if (rep.command === 'TOGGLE_LIGHT') {
            setPowerOn((p) => !p);
            horrorAudio.playFlickerBuzz();
          } else {
            setNarrativeLine(`وصل ردك («${rep.body}»). تذكّر: الكلمة المطلوبة لفتح الباب هي «افتح».`);
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [mode, pushFeed, sessionId]);

  // Poll incoming Google Chat messages while playing so player can reply from Google Chat on their phone
  useEffect(() => {
    chatSeededRef.current = false;
    seenChatMsgNamesRef.current.clear();
  }, [selectedChatSpace]);

  useEffect(() => {
    if (mode !== 'playing' || !workspaceToken || !selectedChatSpace) return;

    const pollChat = async () => {
      const res = await listChatMessages(workspaceToken, selectedChatSpace);
      if (res.error || !res.messages.length) return;

      if (!chatSeededRef.current) {
        res.messages.forEach((m) => seenChatMsgNamesRef.current.add(m.name));
        chatSeededRef.current = true;
        return;
      }

      for (const msg of res.messages) {
        if (!msg.name || seenChatMsgNamesRef.current.has(msg.name)) continue;
        seenChatMsgNamesRef.current.add(msg.name);

        const text = (msg.text || '').trim();
        if (!text) continue;
        const lowered = text.toLowerCase();
        horrorAudio.playSmsSting();
        pushFeed('incoming', `Google Chat (${msg.sender?.displayName || 'مشارك'})`, text);

        const snap = stateSnapshotRef.current;
        if (
          lowered.includes('افتح') ||
          lowered.includes('إفتح') ||
          lowered.includes('open') ||
          lowered.includes('unlock')
        ) {
          if (snap.hasKey) {
            setDoorUnlocked(true);
            horrorAudio.playDoorUnlock();
            setNarrativeLine(
              'تم استلام ردك «افتح» من Google Chat! الباب الفولاذي ينفتح الآن — اهرب للأمام!'
            );
          } else {
            setNarrativeLine(
              'وصلت رسالتك «افتح» عبر Google Chat، لكن التقط المفتاح الصدئ من المكتب أولاً!'
            );
          }
        } else if (
          lowered.includes('نور') ||
          lowered.includes('ضوء') ||
          lowered.includes('light')
        ) {
          setPowerOn((p) => !p);
          horrorAudio.playFlickerBuzz();
        }
      }
    };

    void pollChat();
    const interval = window.setInterval(() => void pollChat(), 3500);
    return () => window.clearInterval(interval);
  }, [mode, pushFeed, selectedChatSpace, workspaceToken]);

  // Keyboard shortcuts for Title Start & Pause Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Escape') {
        if (setupOpen) {
          setSetupOpen(false);
        } else if (pythonOpen) {
          setPythonOpen(false);
        } else if (mode === 'playing') {
          setMode('paused');
        } else if (mode === 'paused') {
          setMode('playing');
        }
      } else if (mode === 'title' && !setupOpen && !pythonOpen && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startNewGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startNewGame = () => {
    horrorAudio.ensureStarted();
    sentEventsRef.current.clear();
    sceneRef.current?.resetPlayer();
    setHasKey(false);
    setDoorUnlocked(false);
    setPowerOn(true);
    setTension(12);
    setFeed([]);
    setNarrativeLine(
      'استيقظتَ في الممر السابع. التقط المفتاح الصدئ من فوق المكتب، ثم أرسل «افتح» من هاتفك.'
    );
    setSetupOpen(false);
    setPythonOpen(false);
    setMode('playing');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    horrorAudio.setMuted(next);
  };

  const handleSimulateReply = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean) return;
    setSimReplyInput('');
    await fetch('/api/twilio/simulate-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, body: clean }),
    }).catch(() => undefined);
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithGoogleWorkspace();
      if (result) {
        setWorkspaceUser(result.user);
        setWorkspaceToken(result.accessToken);
      }
    } catch {
      // ignore popup close
    }
  };

  const handleGoogleSignOut = async () => {
    await logoutWorkspace();
    setWorkspaceUser(null);
    setWorkspaceToken(null);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050608] text-[#E6E2DC]">
      {/* Dedicated WebGL Mount Container (never re-rendered on React HUD updates) */}
      <div ref={canvasMountRef} className="fixed inset-0 h-full w-full" />

      {/* TITLE SCREEN */}
      {mode === 'title' && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between bg-gradient-to-b from-black/75 via-black/35 to-black/85 p-6 md:p-12">
          {/* Minimal Top Actions */}
          <div className="flex items-center justify-between gap-4">
            <span className="font-mono-code text-xs tracking-wider text-[#9CA1AE]">
              ECHO · ROOM 07
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPythonOpen(true)}
                className="flex items-center gap-2 rounded-md border border-[#282B36] bg-[#0D0F14]/95 px-3.5 py-2 text-xs font-semibold text-[#D6B26E] transition-colors hover:border-[#D6B26E]/60 hover:text-white whitespace-nowrap shrink-0"
              >
                <Code2 className="h-4 w-4" />
                كود بايثون الكامل (Python)
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="flex items-center gap-2 rounded-md border border-[#282B36] bg-[#0D0F14]/95 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-[#9E1B24] whitespace-nowrap shrink-0"
              >
                <Settings className="h-4 w-4" />
                إعدادات Twilio &amp; Google
              </button>
            </div>
          </div>

          {/* Focal Title Lockup over negative space */}
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
            <svg
              width="68"
              height="68"
              viewBox="0 0 68 68"
              fill="none"
              className="mb-5 text-[#9E1B24]"
              aria-hidden="true"
            >
              <rect x="10" y="6" width="48" height="56" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <line x1="34" y1="6" x2="34" y2="62" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
              <circle cx="46" cy="34" r="3.5" fill="#D6B26E" />
              <path d="M18 18 L28 24 M18 28 L28 22" stroke="#E6E2DC" strokeWidth="1.3" strokeOpacity="0.6" />
            </svg>

            <h1 className="font-display-horror text-4xl font-bold tracking-tight text-white md:text-6xl">
              الصَّدَى: الغرفة السابعة
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#C4C7D0] md:text-base">
              لعبة رعب نفسية تكسر الجدار الرابع — ما يحدث داخل الممر المظلم يُرسل فوراً إلى هاتفك
              الحقيقي عبر رسائل SMS، ولا يُفتح الباب الفولاذي إلا بردّك المباشر.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={startNewGame}
                className="flex items-center gap-2.5 rounded-md bg-[#9E1B24] px-7 py-3.5 text-base font-bold text-white transition-colors hover:bg-[#B8222D] whitespace-nowrap shrink-0"
              >
                <Play className="h-4 w-4 fill-current" />
                ابدأ اللعب الآن
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="flex items-center gap-2 rounded-md border border-[#343846] bg-[#0D0F14]/95 px-5 py-3.5 text-sm font-semibold text-[#E6E2DC] transition-colors hover:bg-[#171A24] whitespace-nowrap shrink-0"
              >
                <Smartphone className="h-4 w-4 text-[#D6B26E]" />
                {twilioConfig.verified ? 'الهاتف مربوط وجاهز' : 'ربط هاتفك (Twilio Setup)'}
              </button>
            </div>
          </div>

          {/* Single Flat Control-Hint Line */}
          <div className="text-center text-xs text-[#8E929E]">
            WASD التحرك · اسحب بالفأرة للنظر · E أو النقر للتفاعل · Esc إيقاف مؤقت
          </div>
        </div>
      )}

      {/* ACTIVE GAMEPLAY HUD */}
      {mode === 'playing' && (
        <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 md:p-5">
          {/* Top Perimeter Status Clusters */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="pointer-events-auto flex items-center gap-4 rounded-md border border-[#232632] bg-[#0A0B0F]/92 px-4 py-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[#8E929E]">التوتر</span>
                <span
                  className={`font-mono-code font-bold ${
                    tension > 70 ? 'text-[#EF4444]' : tension > 40 ? 'text-[#F59E0B]' : 'text-[#E6E2DC]'
                  }`}
                >
                  {tension}%
                </span>
              </div>
              <span className="text-[#343846]">·</span>
              <div className="flex items-center gap-1.5">
                <KeyRound className={`h-3.5 w-3.5 ${hasKey ? 'text-[#D6B26E]' : 'text-[#555A68]'}`} />
                <span className={hasKey ? 'font-semibold text-[#D6B26E]' : 'text-[#8E929E]'}>
                  {hasKey ? 'المفتاح معك' : 'المفتاح مفقود'}
                </span>
              </div>
              <span className="text-[#343846]">·</span>
              <div className="flex items-center gap-1.5">
                <DoorOpen
                  className={`h-3.5 w-3.5 ${doorUnlocked ? 'text-[#34D399]' : 'text-[#EF4444]'}`}
                />
                <span className={doorUnlocked ? 'font-semibold text-[#34D399]' : 'text-[#C8CBD4]'}>
                  {doorUnlocked ? 'الباب مفتوح' : 'الباب مغلق'}
                </span>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="rounded-md border border-[#232632] bg-[#0A0B0F]/92 p-2 text-[#C8CBD4] hover:text-white"
                aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="rounded-md border border-[#232632] bg-[#0A0B0F]/92 p-2 text-[#C8CBD4] hover:text-white"
                aria-label="إعدادات Twilio"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPythonOpen(true)}
                className="rounded-md border border-[#232632] bg-[#0A0B0F]/92 px-3 py-2 text-xs font-semibold text-[#D6B26E] hover:text-white whitespace-nowrap shrink-0"
              >
                Python
              </button>
              <button
                type="button"
                onClick={() => setMode('paused')}
                className="flex items-center gap-1.5 rounded-md border border-[#232632] bg-[#0A0B0F]/92 px-3 py-2 text-xs font-semibold text-white hover:bg-[#151821] whitespace-nowrap shrink-0"
              >
                <Pause className="h-3.5 w-3.5" />
                إيقاف
              </button>
            </div>
          </div>

          {/* Center Crosshair & Contextual Interaction Prompt */}
          <div className="flex flex-col items-center justify-center gap-3">
            <div
              className={`h-2 w-2 rounded-full transition-transform ${
                hoveredTarget ? 'scale-150 bg-[#D6B26E]' : 'bg-white/60'
              }`}
            />
            {hoverLabel && (
              <button
                type="button"
                onClick={() => hoveredTarget && handleInteract(hoveredTarget)}
                className="pointer-events-auto rounded-md border border-[#3B3F4E] bg-[#0A0B0F]/95 px-3.5 py-1.5 text-xs font-semibold text-[#F3F4F6]"
              >
                {hoverLabel}
              </button>
            )}
          </div>

          {/* Compact Bottom Narrative + Phone Link Dock */}
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setDockOpen((v) => !v)}
              className="pointer-events-auto rounded-md border border-[#242734] bg-[#0A0B0F]/92 px-3 py-1 text-xs text-[#9CA1AE] hover:text-white"
            >
              {dockOpen ? '▾ إخفاء شريط الرسائل' : '▴ إظهار شريط الرسائل'}
            </button>

            {dockOpen && (
              <div className="pointer-events-auto w-full rounded-lg border border-[#242734] bg-[#0A0B0F]/95 p-3.5 shadow-xl">
                <p className="text-xs leading-relaxed text-[#E6E2DC]">{narrativeLine}</p>

                {feed.length > 0 && (
                  <div className="mt-2 border-t border-[#1D202A] pt-2 text-xs">
                    <div className="flex items-center justify-between text-[#8E929E]">
                      <span>{feed[0].channel}</span>
                      <span className="font-mono-code">{feed[0].time}</span>
                    </div>
                    <p
                      className={`mt-0.5 leading-relaxed ${
                        feed[0].direction === 'incoming' ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'
                      }`}
                    >
                      «{feed[0].text}»
                    </p>
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[#1D202A] pt-2.5">
                  <input
                    type="text"
                    placeholder="اكتب ردك كما لو كان من هاتفك (مثال: افتح)..."
                    value={simReplyInput}
                    onChange={(e) => setSimReplyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleSimulateReply(simReplyInput);
                      }
                    }}
                    className="min-w-[180px] flex-1 rounded border border-[#252834] bg-[#11131A] px-2.5 py-1.5 text-xs text-white placeholder-[#666C7D] focus:border-[#9E1B24] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSimulateReply(simReplyInput)}
                    className="flex items-center gap-1 rounded bg-[#1E222E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2A3040] whitespace-nowrap shrink-0"
                  >
                    <Send className="h-3 w-3" />
                    إرسال رد
                  </button>
                  {hasKey && !doorUnlocked && (
                    <button
                      type="button"
                      onClick={() => void handleSimulateReply('افتح')}
                      className="rounded bg-[#9E1B24] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#B8222D] whitespace-nowrap shrink-0"
                    >
                      رد سريع: افتح
                    </button>
                  )}
                  {workspaceToken && selectedChatSpace && (
                    <button
                      type="button"
                      onClick={() => {
                        const msg = simReplyInput.trim() || `حدث الغرفة السابعة: ${narrativeLine}`;
                        setPendingChatConfirm(msg);
                      }}
                      className="flex items-center gap-1 rounded border border-[#2C3140] bg-[#13161F] px-2.5 py-1.5 text-xs text-[#D6B26E] hover:text-white whitespace-nowrap shrink-0"
                    >
                      <MessageSquare className="h-3 w-3" />
                      إرسال إلى Google Chat
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {mode === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[#262936] bg-[#0B0C10] p-6 text-center shadow-2xl">
            <h2 className="font-display-horror text-3xl font-bold text-white">إيقاف مؤقت</h2>
            <p className="mt-2 text-xs text-[#8E929E]">
              ما زال الكيان ينتظر عودتك في الممر السابع.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setMode('playing')}
                className="rounded-md bg-[#9E1B24] py-2.5 text-sm font-bold text-white hover:bg-[#B8222D]"
              >
                متابعة اللعب
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="rounded-md border border-[#282B36] bg-[#13161F] py-2.5 text-sm font-semibold text-white hover:bg-[#1B1F2B]"
              >
                إعدادات Twilio &amp; Google
              </button>
              <button
                type="button"
                onClick={() => setPythonOpen(true)}
                className="rounded-md border border-[#282B36] bg-[#13161F] py-2.5 text-sm font-semibold text-[#D6B26E] hover:bg-[#1B1F2B]"
              >
                عرض وتحميل كود بايثون
              </button>
              <button
                type="button"
                onClick={startNewGame}
                className="flex items-center justify-center gap-2 rounded-md border border-[#282B36] bg-[#13161F] py-2.5 text-sm font-medium text-[#C8CBD4] hover:bg-[#1B1F2B]"
              >
                <RotateCcw className="h-4 w-4" />
                إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={() => setMode('title')}
                className="py-2 text-xs text-[#8E929E] hover:text-white"
              >
                العودة إلى الشاشة الرئيسية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY / FOURTH-WALL BROKEN MODAL */}
      {mode === 'victory' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[#3B171D] bg-[#0B0C10] p-8 text-center shadow-2xl">
            <h2 className="font-display-horror text-4xl font-bold text-white">
              تحطّم الجدار الرابع
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#D1D5DB]">
              عبرتَ الباب الفولاذي ونجوت من الممر السابع... لكنّ اللعبة لم تغلق بعد. راجع رسائل
              هاتفك الآن:
            </p>
            <div className="mt-4 rounded-md border border-[#292C38] bg-[#07080B] p-4 text-sm text-[#FCA5A5]">
              «هربتَ من الشاشة... لكن الجدار الرابع قد تحطّم. انظر خلفك في غرفتك الحقيقية.»
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={startNewGame}
                className="rounded-md bg-[#9E1B24] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#B8222D]"
              >
                اللعب مجدداً
              </button>
              <button
                type="button"
                onClick={() => setPythonOpen(true)}
                className="rounded-md border border-[#2C303D] bg-[#141720] px-5 py-2.5 text-sm font-semibold text-[#D6B26E] hover:bg-[#1B1F2B]"
              >
                الحصول على كود بايثون الكامل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      <TwilioSetupModal
        open={setupOpen}
        sessionId={sessionId}
        config={twilioConfig}
        onChangeConfig={setTwilioConfig}
        onClose={() => setSetupOpen(false)}
        onStartAfterSetup={startNewGame}
        workspaceUser={workspaceUser}
        workspaceToken={workspaceToken}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={handleGoogleSignOut}
        selectedChatSpace={selectedChatSpace}
        onSelectChatSpace={setSelectedChatSpace}
        chatAutoEnabled={chatAutoEnabled}
        onToggleChatAuto={setChatAutoEnabled}
        intakeForm={intakeForm}
        onUpdateIntakeForm={setIntakeForm}
      />

      <PythonSuiteModal open={pythonOpen} onClose={() => setPythonOpen(false)} />

      <ConfirmActionModal
        open={Boolean(pendingChatConfirm)}
        title="تأكيد النشر في Google Chat"
        description="هل تريد إرسال هذه الرسالة إلى مساحة Google Chat المختارة؟"
        details={pendingChatConfirm || undefined}
        confirmLabel="إرسال إلى Google Chat"
        onCancel={() => setPendingChatConfirm(null)}
        onConfirm={() => {
          const text = pendingChatConfirm;
          setPendingChatConfirm(null);
          if (text && workspaceToken && selectedChatSpace) {
            void sendChatMessage(workspaceToken, selectedChatSpace, text).then((res) => {
              if (res.ok) {
                setSimReplyInput('');
                pushFeed('outgoing', 'Google Chat', text);
              } else {
                pushFeed('system', 'Google Chat', res.error || 'تعذر الإرسال إلى Chat.');
              }
            });
          }
        }}
      />
    </div>
  );
}
