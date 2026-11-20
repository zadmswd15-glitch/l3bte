import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmActionModalProps {
  open: boolean;
  title: string;
  description: string;
  details?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  open,
  title,
  description,
  details,
  confirmLabel,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-action-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#2C2F3A] bg-[#0D0F14] p-6 text-[#E6E2DC] shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#5B1A20] bg-[#220B0E] text-[#E0525E]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 id="confirm-action-title" className="text-lg font-bold text-white">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1.5 text-[#8E929E] transition-colors hover:bg-[#191C24] hover:text-white"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#C4C7D0]">{description}</p>

        {details && (
          <div className="mt-3 rounded-md border border-[#222530] bg-[#090A0D] p-3 text-xs leading-relaxed text-[#9CA1AE]">
            {details}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[#2A2D38] bg-[#141720] px-4 py-2 text-sm font-medium text-[#D1D5DB] transition-colors hover:bg-[#1C202C] whitespace-nowrap shrink-0"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-[#9E1B24] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B8222D] whitespace-nowrap shrink-0"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
