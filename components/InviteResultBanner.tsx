"use client";
import { useState } from "react";

export interface InviteResult {
  type: "success" | "warning" | "error" | "info";
  message: string;
  inviteLink?: string | null;
}

interface Props {
  result: InviteResult | null;
  onDismiss?: () => void;
}

export default function InviteResultBanner({ result, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const handleCopy = async () => {
    if (!result.inviteLink) return;
    try {
      await navigator.clipboard.writeText(result.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = result.inviteLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const isWarning = result.type === "warning";
  const isError = result.type === "error";
  const isSuccess = result.type === "success";

  const containerStyles = isWarning
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : isError
    ? "bg-rose-50 border-rose-200 text-rose-900"
    : isSuccess
    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
    : "bg-blue-50 border-blue-200 text-blue-900";

  const badgeStyles = isWarning
    ? "bg-amber-100 text-amber-800 border-amber-300"
    : isError
    ? "bg-rose-100 text-rose-800 border-rose-300"
    : isSuccess
    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : "bg-blue-100 text-blue-800 border-blue-300";

  return (
    <div className={`p-4 rounded-xl border ${containerStyles} space-y-3 transition-all animate-fadeIn shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold border ${badgeStyles}`}
          >
            {isWarning ? "!" : isError ? "✕" : isSuccess ? "✓" : "i"}
          </span>
          <div>
            <p className="text-xs font-semibold leading-relaxed">{result.message}</p>
            {isWarning && (
              <p className="text-xs text-amber-700 mt-1">
                The account has been created in the database. Because email delivery encountered an issue, please share the setup link below directly with the user.
              </p>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium opacity-60 hover:opacity-100 transition-opacity p-1"
          >
            ✕
          </button>
        )}
      </div>

      {result.inviteLink && (
        <div className="mt-2 pt-3 border-t border-slate-200/60 bg-white/80 rounded-lg p-3 space-y-2 border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Direct Setup / Invitation Link
            </span>
            <span className="text-[11px] text-slate-500">
              Valid for initial account activation
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={result.inviteLink}
              className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-slate-700 outline-none select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-medium rounded bg-slate-900 text-white hover:bg-slate-800 active:scale-95 transition-all whitespace-nowrap cursor-pointer shadow-2xs"
            >
              {copied ? "✓ Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
