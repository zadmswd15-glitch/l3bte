import React, { useState } from 'react';
import { Check, Code2, Copy, Download, MessageSquareWarning, X } from 'lucide-react';
import { HORROR_SMS_MESSAGES, PYTHON_PROJECT_FILES } from '../lib/pythonSuite';

interface PythonSuiteModalProps {
  open: boolean;
  onClose: () => void;
}

export const PythonSuiteModal: React.FC<PythonSuiteModalProps> = ({ open, onClose }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSmsGallery, setShowSmsGallery] = useState(false);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  if (!open) return null;

  const activeFile = PYTHON_PROJECT_FILES[selectedIdx];

  const handleCopy = async (filename: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFile(filename);
      setTimeout(() => setCopiedFile(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="python-suite-title"
    >
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#242732] bg-[#0B0C10] text-[#E6E2DC] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E212B] px-6 py-4">
          <div className="flex items-center gap-3">
            <Code2 className="h-5 w-5 text-[#D6B26E]" />
            <div>
              <h2 id="python-suite-title" className="font-display-horror text-xl font-bold text-white">
                كود بايثون المتكامل (Twilio + Flask + ngrok + Tkinter)
              </h2>
              <p className="text-xs text-[#8E929E]">
                مشروع بايثون كامل ومنظم مع معالجة أخطاء الحساب التجريبي وحلقة اللعب التفاعلية.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSmsGallery((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                showSmsGallery
                  ? 'border-[#9E1B24] bg-[#240B0F] text-white'
                  : 'border-[#272A36] bg-[#13151D] text-[#C8CBD4] hover:text-white'
              }`}
            >
              <MessageSquareWarning className="h-3.5 w-3.5" />
              رسائل الرعب الخمس (SMS)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-[#8E929E] transition-colors hover:bg-[#161922] hover:text-white"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {showSmsGallery ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                5 رسائل SMS مرعبة وقصيرة باللغة العربية (مربوطة بأحداث اللعبة)
              </h3>
              <p className="text-xs text-[#8E929E]">
                تُرسل هذه الرسائل تلقائياً أثناء اللعب الحقيقي عند تحقق كل حدث داخل الغرفة السابعة.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {HORROR_SMS_MESSAGES.map((sms) => (
                <div
                  key={sms.id}
                  className="space-y-2 rounded-md border border-[#222531] bg-[#101218] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#D6B26E]">{sms.titleAr}</span>
                    <button
                      type="button"
                      onClick={() => void handleCopy(sms.id, sms.bodyAr)}
                      className="text-xs text-[#8E929E] hover:text-white whitespace-nowrap shrink-0"
                    >
                      {copiedFile === sms.id ? 'تم النسخ' : 'نسخ النص'}
                    </button>
                  </div>
                  <p className="text-xs text-[#8E929E]">{sms.triggerAr}</p>
                  <p className="rounded bg-[#08090C] p-3 text-sm leading-relaxed text-white">
                    «{sms.bodyAr}»
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {/* File Sidebar */}
            <aside className="w-full shrink-0 border-b border-[#1E212B] bg-[#090A0D] p-3 md:w-64 md:border-b-0 md:border-l">
              <div className="flex gap-1.5 overflow-x-auto md:flex-col">
                {PYTHON_PROJECT_FILES.map((file, idx) => (
                  <button
                    key={file.filename}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={`rounded-md px-3 py-2.5 text-right transition-colors shrink-0 ${
                      selectedIdx === idx
                        ? 'bg-[#191D28] text-white'
                        : 'text-[#9CA1AE] hover:bg-[#12141B] hover:text-white'
                    }`}
                  >
                    <div dir="ltr" className="font-mono-code text-xs font-semibold text-[#D6B26E]">
                      {file.filename}
                    </div>
                    <div className="mt-0.5 text-xs text-[#9CA1AE]">{file.titleAr}</div>
                  </button>
                ))}
              </div>
            </aside>

            {/* Code Panel */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E212B] bg-[#0D0F14] px-4 py-2.5">
                <div>
                  <span dir="ltr" className="font-mono-code text-xs font-bold text-white">
                    {activeFile.filename}
                  </span>
                  <span className="mx-2 text-[#454A59]">·</span>
                  <span className="text-xs text-[#9CA1AE]">{activeFile.descriptionAr}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(activeFile.filename, activeFile.code)}
                    className="flex items-center gap-1.5 rounded border border-[#272A36] bg-[#141720] px-3 py-1.5 text-xs font-medium text-[#E5E7EB] hover:bg-[#1D212E] whitespace-nowrap shrink-0"
                  >
                    {copiedFile === activeFile.filename ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#34D399]" />
                        تم النسخ
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        نسخ الكود
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(activeFile.filename, activeFile.code)}
                    className="flex items-center gap-1.5 rounded bg-[#9E1B24] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#B8222D] whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    تحميل الملف
                  </button>
                </div>
              </div>

              <pre
                dir="ltr"
                className="font-mono-code flex-1 overflow-auto bg-[#07080B] p-4 text-left text-xs leading-6 text-[#D8DCE6]"
              >
                <code>{activeFile.code}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
