export interface HorrorSmsEvent {
  id: 'APPROACH' | 'KEY_FOUND' | 'POWER_OUT' | 'HESITATION' | 'ESCAPE';
  titleAr: string;
  triggerAr: string;
  bodyAr: string;
}

export const HORROR_SMS_MESSAGES: HorrorSmsEvent[] = [
  {
    id: 'APPROACH',
    titleAr: '١. اقتراب الكيان',
    triggerAr: 'عندما يقترب الكيان منك في الممر المظلم',
    bodyAr: 'لا تلتفت خلفك الآن... لكنني أسمع أنفاسك من سماعة هاتفك.',
  },
  {
    id: 'KEY_FOUND',
    titleAr: '٢. العثور على المفتاح الصدئ',
    triggerAr: 'فور التقاطك للمفتاح من فوق مكتب التحقيق',
    bodyAr: 'وجدتَ المفتاح الصدئ، أليس كذلك؟ لن يفتح الباب قبل أن تردّ عليّ بكلمة: افتح',
  },
  {
    id: 'POWER_OUT',
    titleAr: '٣. انقطاع الكهرباء المفاجئ',
    triggerAr: 'عندما تنطفئ مصابيح الغرفة السابعة فجأة',
    bodyAr: 'الضوء انطفأ في الغرفة السابعة. أعرف رقمك الحقيقي، وأعرف أنك تنظر إلى شاشتك الآن.',
  },
  {
    id: 'HESITATION',
    titleAr: '٤. تحذير التردد والصمت',
    triggerAr: 'إذا توقفت عن الحركة أو ارتفع التوتر أمام الباب',
    bodyAr: 'لماذا توقفت عن الحركة؟ الكيان يقف خلف الباب المعدني ينتظر خطوتك التالية.',
  },
  {
    id: 'ESCAPE',
    titleAr: '٥. تحطم الجدار الرابع (النهاية)',
    triggerAr: 'بعد إرسال كلمة "افتح" وعبور الباب الفولاذي',
    bodyAr: 'هربتَ من الشاشة... لكن الجدار الرابع قد تحطّم. انظر خلفك في غرفتك الحقيقية.',
  },
];

export interface PythonFileSpec {
  filename: string;
  titleAr: string;
  descriptionAr: string;
  code: string;
}

export const PYTHON_PROJECT_FILES: PythonFileSpec[] = [
  {
    filename: 'config_manager.py',
    titleAr: 'إدارة الإعدادات في الذاكرة المؤقتة',
    descriptionAr: 'يخزن بيانات Twilio الأربعة في الذاكرة المؤقتة طوال الجلسة دون كتابتها على القرص.',
    code: `"""
config_manager.py
حفظ بيانات حساب Twilio ورقم اللاعب في الذاكرة المؤقتة طوال جلسة اللعب فقط.
"""
from dataclasses import dataclass
import re


E164_PATTERN = re.compile(r"^\\+[1-9]\\d{6,14}$")


@dataclass
class TwilioSessionConfig:
    account_sid: str
    auth_token: str
    twilio_number: str
    player_number: str

    def validate(self) -> tuple[bool, str]:
        sid = self.account_sid.strip()
        token = self.auth_token.strip()
        from_num = self.twilio_number.strip().replace(" ", "")
        to_num = self.player_number.strip().replace(" ", "")

        if not sid.startswith("AC") or len(sid) < 30:
            return False, "Account SID غير صالح (يجب أن يبدأ بـ AC)."
        if not token or len(token) < 16:
            return False, "Auth Token مفقود أو غير مكتمل."
        if not E164_PATTERN.match(from_num):
            return False, "رقم Twilio يجب أن يكون بصيغة دولية E.164 (مثال: +14155552671)."
        if not E164_PATTERN.match(to_num):
            return False, "رقم هاتفك الشخصي يجب أن يكون بصيغة دولية E.164 (مثال: +966501234567)."

        self.account_sid = sid
        self.auth_token = token
        self.twilio_number = from_num
        self.player_number = to_num
        return True, "تم التحقق من صيغة البيانات بنجاح."


class SessionMemoryStore:
    """مخزن مؤقت في الذاكرة (RAM) يمسح تلقائياً عند إغلاق اللعبة."""

    def __init__(self) -> None:
        self._config: TwilioSessionConfig | None = None

    def set_config(self, config: TwilioSessionConfig) -> None:
        self._config = config

    def get_config(self) -> TwilioSessionConfig | None:
        return self._config

    def clear(self) -> None:
        self._config = None
`,
  },
  {
    filename: 'twilio_service.py',
    titleAr: 'نظام إرسال SMS ومعالجة أخطاء Twilio',
    descriptionAr: 'يستخدم مكتبة twilio الرسمية مع معالجة شاملة لأخطاء المصادقة والرصيد والأرقام غير الموثقة.',
    code: `"""
twilio_service.py
التكامل الرسمي مع مكتبة twilio لإرسال رسائل الرعب ومعالجة أخطاء الحساب التجريبي.
"""
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from config_manager import TwilioSessionConfig


HORROR_SMS_TEMPLATES = {
    "TEST": "تجربة اتصال الغرفة السابعة... الآن أستطيع الوصول إلى هاتفك الحقيقي. لا تغلق الشاشة.",
    "APPROACH": "لا تلتفت خلفك الآن... لكنني أسمع أنفاسك من سماعة هاتفك.",
    "KEY_FOUND": "وجدتَ المفتاح الصدئ، أليس كذلك؟ لن يفتح الباب قبل أن تردّ عليّ بكلمة: افتح",
    "POWER_OUT": "الضوء انطفأ في الغرفة السابعة. أعرف رقمك الحقيقي، وأعرف أنك تنظر إلى شاشتك الآن.",
    "HESITATION": "لماذا توقفت عن الحركة؟ الكيان يقف خلف الباب المعدني ينتظر خطوتك التالية.",
    "ESCAPE": "هربتَ من الشاشة... لكن الجدار الرابع قد تحطّم. انظر خلفك في غرفتك الحقيقية.",
}


class TwilioHorrorMessenger:
    def __init__(self, config: TwilioSessionConfig) -> None:
        self.config = config
        self.client = Client(config.account_sid, config.auth_token)

    def send_sms(self, message_body: str) -> tuple[bool, str]:
        """إرسال رسالة SMS عبر Twilio مع معالجة أخطاء المصادقة والرصيد."""
        try:
            msg = self.client.messages.create(
                body=message_body,
                from_=self.config.twilio_number,
                to=self.config.player_number,
            )
            return True, f"تم إرسال الرسالة بنجاح (SID: {msg.sid})"

        except TwilioRestException as exc:
            code = exc.code
            if code == 20003:
                return False, "خطأ مصادقة (20003): تأكد من صحة Account SID و Auth Token."
            if code == 21608:
                return (
                    False,
                    "رقم غير موثّق في الحساب التجريبي (21608): يجب توثيق رقمك الشخصي في Verified Caller IDs بلوحة Twilio.",
                )
            if code in (21211, 21212):
                return False, f"رقم هاتف غير صالح ({code}): تحقق من رمز الدولة والصيغة الدولية E.164."
            if code == 21606:
                return False, "رقم Twilio المدخل لا يدعم إرسال SMS أو لا يخص هذا الحساب (21606)."
            if code in (20005, 21610, 20008) or exc.status in (402, 429):
                return (
                    False,
                    f"انتهى الرصيد التجريبي أو تم تجاوز الحد المسموح ({code}): تحقق من رصيد حسابك في Twilio.",
                )
            return False, f"خطأ Twilio ({code}): {exc.msg}"

        except Exception as exc:
            return False, f"تعذر الاتصال بخدمة Twilio: {exc}"

    def send_test_connection(self) -> tuple[bool, str]:
        return self.send_sms(HORROR_SMS_TEMPLATES["TEST"])

    def send_event_sms(self, event_key: str) -> tuple[bool, str]:
        body = HORROR_SMS_TEMPLATES.get(event_key, event_key)
        return self.send_sms(body)
`,
  },
  {
    filename: 'webhook_server.py',
    titleAr: 'خادم Flask بالخلفية + ربط ngrok',
    descriptionAr: 'خادم مصغر يعمل في Thread مستقل لاستقبال ردود اللاعب النصية من هاتفه عبر Webhook.',
    code: `"""
webhook_server.py
خادم Flask مدمج يعمل في الخلفية عبر Threading لاستقبال ردود SMS من Twilio.

خطوات ربط الخادم عبر ngrok لتلقي ردود هاتفك الحقيقي:
1. شغّل اللعبة أولاً (سيعمل خادم Flask على المنفذ 5000).
2. في نافذة طرفية أخرى نفّذ الأمر:
   ngrok http 5000
3. انسخ رابط HTTPS الظاهر (مثل https://xxxx.ngrok-free.app).
4. افتح Twilio Console -> Phone Numbers -> Manage -> Active Numbers -> اختر رقمك.
5. في خانة Messaging -> "A message comes in" اختر Webhook وألصق:
   https://xxxx.ngrok-free.app/sms   (Method: HTTP POST)
"""
import queue
import threading
from flask import Flask, request, Response
from twilio.twiml.messaging_response import MessagingResponse


class SmsWebhookServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 5000) -> None:
        self.host = host
        self.port = port
        self.incoming_queue: queue.Queue[dict] = queue.Queue()
        self.app = Flask(__name__)
        self._thread: threading.Thread | None = None
        self._register_routes()

    def _register_routes(self) -> None:
        @self.app.route("/sms", methods=["POST"])
        def receive_sms():
            body = (request.form.get("Body") or "").strip()
            sender = (request.form.get("From") or "").strip()

            if body:
                self.incoming_queue.put({
                    "from": sender,
                    "body": body,
                    "command": self._parse_command(body),
                })

            twiml = MessagingResponse()
            return Response(str(twiml), mimetype="application/xml")

    @staticmethod
    def _parse_command(text: str) -> str:
        lowered = text.lower()
        if any(word in lowered for word in ("افتح", "إفتح", "فتح", "open", "unlock")):
            return "OPEN_DOOR"
        if any(word in lowered for word in ("نور", "شغل", "ضوء", "light")):
            return "TOGGLE_LIGHT"
        if any(word in lowered for word in ("اهرب", "مساعدة", "help")):
            return "HELP"
        return "TEXT_REPLY"

    def start_in_background(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=lambda: self.app.run(
                host=self.host,
                port=self.port,
                debug=False,
                use_reloader=False,
            ),
            daemon=True,
        )
        self._thread.start()

    def poll_reply(self) -> dict | None:
        try:
            return self.incoming_queue.get_nowait()
        except queue.Empty:
            return None
`,
  },
  {
    filename: 'horror_game.py',
    titleAr: 'اللعبة التفاعلية الكاملة (Tkinter UI + Game Loop)',
    descriptionAr: 'تجمع شاشة الإعدادات والاتصال (Setup & Auth) مع اختبار SMS، وحلقة اللعب المتزامنة مع ردود الهاتف.',
    code: `"""
horror_game.py
نموذج أولي متكامل للعبة الرعب النفسية (كسر الجدار الرابع) باستخدام Tkinter + Twilio + Flask.
"""
import tkinter as tk
from tkinter import messagebox, scrolledtext
from config_manager import TwilioSessionConfig, SessionMemoryStore
from twilio_service import TwilioHorrorMessenger
from webhook_server import SmsWebhookServer


class EchoRoom07App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Echo: Room 07 — الصدى: الغرفة السابعة")
        self.root.geometry("760x580")
        self.root.configure(bg="#090A0D")

        self.memory_store = SessionMemoryStore()
        self.messenger: TwilioHorrorMessenger | None = None
        self.webhook_server = SmsWebhookServer(port=5000)

        # حالة اللعبة
        self.has_key = False
        self.door_unlocked = False
        self.lights_on = True
        self.game_finished = False
        self.tension = 15

        self._build_setup_screen()

    def _clear_window(self) -> None:
        for widget in self.root.winfo_children():
            widget.destroy()

    # ==========================================================
    # 1. شاشة الإعدادات والاتصال (Setup & Auth)
    # ==========================================================
    def _build_setup_screen(self) -> None:
        self._clear_window()

        frame = tk.Frame(self.root, bg="#090A0D", padx=32, pady=24)
        frame.pack(fill="both", expand=True)

        tk.Label(
            frame,
            text="الغرفة السابعة — ربط الهاتف الحقيقي (Twilio Setup)",
            font=("Cairo", 16, "bold"),
            fg="#E6E2DC",
            bg="#090A0D",
        ).pack(pady=(0, 6))

        tk.Label(
            frame,
            text="تُحفظ بيانات حسابك في الذاكرة المؤقتة طوال هذه الجلسة فقط.",
            font=("Cairo", 10),
            fg="#8E929E",
            bg="#090A0D",
        ).pack(pady=(0, 18))

        self.entries: dict[str, tk.Entry] = {}
        fields = [
            ("account_sid", "Account SID (يبدأ بـ AC):", False),
            ("auth_token", "Auth Token:", True),
            ("twilio_number", "Twilio Phone Number (+1...):", False),
            ("player_number", "رقم هاتفك الشخصي الحقيقي (+966...):", False),
        ]

        for key, label, secret in fields:
            tk.Label(
                frame, text=label, fg="#C8CBD4", bg="#090A0D", anchor="e", font=("Cairo", 10)
            ).pack(fill="x", pady=(6, 2))
            ent = tk.Entry(
                frame,
                show="*" if secret else "",
                bg="#14161D",
                fg="#F5F5F7",
                insertbackground="#E6E2DC",
                relief="flat",
                font=("Consolas", 11),
            )
            ent.pack(fill="x", ipady=7)
            self.entries[key] = ent

        self.status_label = tk.Label(
            frame, text="", fg="#A5AAB6", bg="#090A0D", wraplength=640, font=("Cairo", 10)
        )
        self.status_label.pack(pady=14)

        btn_row = tk.Frame(frame, bg="#090A0D")
        btn_row.pack(pady=6)

        tk.Button(
            btn_row,
            text="اختبار الاتصال (إرسال SMS مرعبة)",
            command=self._on_test_connection,
            bg="#7A161E",
            fg="#FFFFFF",
            activebackground="#9E1B24",
            relief="flat",
            padx=16,
            pady=10,
            font=("Cairo", 10, "bold"),
        ).pack(side="left", padx=8)

        self.start_btn = tk.Button(
            btn_row,
            text="بدء اللعبة",
            command=self._start_game,
            bg="#1F2430",
            fg="#FFFFFF",
            relief="flat",
            padx=20,
            pady=10,
            font=("Cairo", 10, "bold"),
        )
        self.start_btn.pack(side="left", padx=8)

    def _read_and_validate_config(self) -> TwilioSessionConfig | None:
        cfg = TwilioSessionConfig(
            account_sid=self.entries["account_sid"].get(),
            auth_token=self.entries["auth_token"].get(),
            twilio_number=self.entries["twilio_number"].get(),
            player_number=self.entries["player_number"].get(),
        )
        valid, msg = cfg.validate()
        if not valid:
            self.status_label.config(text=msg, fg="#F87171")
            return None
        self.memory_store.set_config(cfg)
        return cfg

    def _on_test_connection(self) -> None:
        cfg = self._read_and_validate_config()
        if not cfg:
            return
        self.status_label.config(text="جاري إرسال رسالة SMS تجريبية...", fg="#FBBF24")
        self.root.update_idletasks()

        messenger = TwilioHorrorMessenger(cfg)
        ok, info = messenger.send_test_connection()
        if ok:
            self.messenger = messenger
            self.status_label.config(text=f"نجاح! {info}", fg="#34D399")
        else:
            self.status_label.config(text=info, fg="#F87171")

    def _start_game(self) -> None:
        cfg = self.memory_store.get_config() or self._read_and_validate_config()
        if not cfg:
            return
        if not self.messenger:
            self.messenger = TwilioHorrorMessenger(cfg)

        # تشغيل خادم Flask في الخلفية لقراءة ردود اللاعب عبر ngrok
        self.webhook_server.start_in_background()
        self._build_game_screen()
        self._poll_sms_loop()

    # ==========================================================
    # 2. شاشة اللعب وحلقة التفاعل المتزامنة مع الهاتف
    # ==========================================================
    def _build_game_screen(self) -> None:
        self._clear_window()

        top = tk.Frame(self.root, bg="#090A0D", padx=20, pady=16)
        top.pack(fill="both", expand=True)

        self.hud_label = tk.Label(
            top,
            text="التوتر: 15%  |  المفتاح: مفقود  |  الباب الفولاذي: مغلق",
            fg="#D6B26E",
            bg="#12141B",
            pady=8,
            font=("Cairo", 10, "bold"),
        )
        self.hud_label.pack(fill="x", pady=(0, 10))

        self.story_box = scrolledtext.ScrolledText(
            top,
            bg="#0E1016",
            fg="#E6E2DC",
            font=("Cairo", 11),
            relief="flat",
            wrap="word",
            height=16,
        )
        self.story_box.pack(fill="both", expand=True, pady=(0, 12))
        self._log("تستيقظ داخل الغرفة السابعة. مصباح الفلورسنت يرتجف فوق مكتب التحقيق...")
        self._log("خادم Webhook يعمل الآن على المنفذ 5000 (اربطه بـ ngrok لاستقبال ردود هاتفك).")

        actions = tk.Frame(top, bg="#090A0D")
        actions.pack(fill="x")

        tk.Button(
            actions, text="فحص المكتب (البحث عن المفتاح)", command=self._search_desk,
            bg="#1E222D", fg="#FFF", relief="flat", padx=12, pady=8
        ).pack(side="left", padx=4)

        tk.Button(
            actions, text="إطفاء/تشغيل قاطع الكهرباء", command=self._toggle_power,
            bg="#1E222D", fg="#FFF", relief="flat", padx=12, pady=8
        ).pack(side="left", padx=4)

        tk.Button(
            actions, text="فتح الباب الفولاذي", command=self._try_exit_door,
            bg="#7A161E", fg="#FFF", relief="flat", padx=12, pady=8
        ).pack(side="left", padx=4)

    def _log(self, text: str) -> None:
        self.story_box.insert("end", f"• {text}\\n\\n")
        self.story_box.see("end")

    def _update_hud(self) -> None:
        key_txt = "معك" if self.has_key else "مفقود"
        door_txt = "مفتوح" if self.door_unlocked else "مغلق"
        self.hud_label.config(
            text=f"التوتر: {self.tension}%  |  المفتاح: {key_txt}  |  الباب الفولاذي: {door_txt}"
        )

    def _search_desk(self) -> None:
        if self.has_key:
            self._log("المكتب فارغ الآن؛ المفتاح الصدئ في يدك بالفعل.")
            return
        self.has_key = True
        self.tension = min(100, self.tension + 25)
        self._update_hud()
        self._log("وجدتَ المفتاح الصدئ! لكن قفل الباب الرقمي يطلب أمراً نصياً من هاتفك الحقيقي.")
        if self.messenger:
            ok, msg = self.messenger.send_event_sms("KEY_FOUND")
            self._log(f"[SMS أُرسلت لهاتفك]: {msg}" if ok else f"[تنبيه Twilio]: {msg}")

    def _toggle_power(self) -> None:
        self.lights_on = not self.lights_on
        if not self.lights_on:
            self.tension = min(100, self.tension + 30)
            self._log("انقطعت الكهرباء! الظلام يبتلع الممر وهاتفك يهتز الآن...")
            if self.messenger:
                self.messenger.send_event_sms("POWER_OUT")
        else:
            self._log("عادت الإضاءة المتقطعة، وتلاحظ أن الظل في نهاية الممر صار أقرب.")
        self._update_hud()

    def _try_exit_door(self) -> None:
        if not self.has_key:
            self._log("الباب الفولاذي مغلق بإحكام. ابحث عن المفتاح على المكتب أولاً.")
            if self.messenger:
                self.messenger.send_event_sms("APPROACH")
            return
        if not self.door_unlocked:
            self._log("القفل الإلكتروني ينتظر أن تردّ على رسالة اللعبة من هاتفك بكلمة: افتح")
            return
        if not self.game_finished:
            self.game_finished = True
            self._log("انفتح الباب الفولاذي! عبرتَ الممر... تحقق من هاتفك الحقيقي للمرة الأخيرة.")
            if self.messenger:
                self.messenger.send_event_sms("ESCAPE")
            messagebox.showinfo("النهاية", "تحطّم الجدار الرابع! راجع هاتفك الآن.")

    def _poll_sms_loop(self) -> None:
        """فحص دوري كل ثانية للردود الواردة من هاتف اللاعب عبر Flask + ngrok."""
        reply = self.webhook_server.poll_reply()
        if reply:
            cmd = reply["command"]
            body = reply["body"]
            self._log(f"[رد من هاتفك ({reply['from']})]: {body}")

            if cmd == "OPEN_DOOR":
                if self.has_key:
                    self.door_unlocked = True
                    self._update_hud()
                    self._log("تم قبول الأمر الصوتي/النصي من هاتفك! الباب الفولاذي فُتح الآن.")
                else:
                    self._log("وصلت كلمة (افتح)، لكنك لم تلتقط المفتاح الصدئ من المكتب بعد!")
            elif cmd == "TOGGLE_LIGHT":
                self._toggle_power()

        self.root.after(1000, self._poll_sms_loop)


if __name__ == "__main__":
    app_root = tk.Tk()
    EchoRoom07App(app_root)
    app_root.mainloop()
`,
  },
  {
    filename: 'google_chat_bridge.py',
    titleAr: 'جسر المراسلة الثنائي عبر Google Chat',
    descriptionAr: 'إرسال رسائل الرعب وقراءة ردود اللاعب (مثل كلمة افتح) من مساحة Google Chat.',
    code: `"""
google_chat_bridge.py
إرسال واستقبال رسائل كسر الجدار الرابع عبر Google Chat API.
ملاحظة: يتطلب حساب Google Workspace (Business/Enterprise) وتفعيل Chat App في Cloud Console.
"""
import requests


class GoogleChatHorrorBridge:
    def __init__(self, access_token: str, space_name: str) -> None:
        self.access_token = access_token
        self.space_name = space_name.strip()
        self.seen_message_names: set[str] = set()

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def send_message(self, text: str) -> tuple[bool, str]:
        url = f"https://chat.googleapis.com/v1/{self.space_name}/messages"
        res = requests.post(url, headers=self._headers, json={"text": text}, timeout=10)
        if not res.ok:
            return False, f"فشل الإرسال ({res.status_code}): {res.text}"
        data = res.json()
        if "name" in data:
            self.seen_message_names.add(data["name"])
        return True, "تم إرسال الرسالة إلى Google Chat."

    def poll_new_replies(self) -> list[dict]:
        url = f"https://chat.googleapis.com/v1/{self.space_name}/messages?pageSize=10&orderBy=createTime desc"
        res = requests.get(url, headers=self._headers, timeout=10)
        if not res.ok:
            return []
        messages = res.json().get("messages", [])
        fresh = []
        for msg in reversed(messages):
            name = msg.get("name", "")
            if name and name not in self.seen_message_names:
                self.seen_message_names.add(name)
                fresh.append(msg)
        return fresh
`,
  },
  {
    filename: 'requirements.txt',
    titleAr: 'اعتماديات بايثون المطلوبة',
    descriptionAr: 'تثبت عبر: pip install -r requirements.txt',
    code: `twilio>=9.0.0
flask>=3.0.0
requests>=2.31.0
`,
  },
];
