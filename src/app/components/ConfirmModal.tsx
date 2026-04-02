import React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-5">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex flex-col items-center text-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${variant === "danger" ? "bg-red-100" : "bg-[#eaedff]"}`}>
            {variant === "danger"
              ? <Trash2 className="h-6 w-6 text-red-600" />
              : <AlertTriangle className="h-6 w-6 text-[#004ac6]" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-[#131b2e]">{title}</h2>
            <p className="text-sm text-[#737686] mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-[#c3c6d7] text-[#434655] font-semibold text-sm hover:bg-[#f2f3ff] transition-colors active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-colors active:scale-95 ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[#004ac6] hover:bg-[#003ea8]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
