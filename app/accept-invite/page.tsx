"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";

type Stage = "checking" | "ready-to-verify" | "verified" | "error";

// IMPORTANT: this page expects the invite email to link here directly with
// ?token_hash=...&type=invite (see README "Stop email scanners from burning
// invite links" section) — NOT Supabase's default {{ .ConfirmationURL }},
// which points at Supabase's own auto-verifying endpoint. That endpoint gets
// silently visited (and the one-time token consumed) by Gmail/Outlook/etc.
// link-scanners before the person ever clicks it. Verification only fires
// here on a genuine button click, which a scanner never performs.
export default function AcceptInvitePage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    // If they're already mid-session (e.g. re-opened this tab after verifying),
    // skip straight to the password form.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setEmail(data.session.user.email ?? "");
        setStage("verified");
        return;
      }
      const p = new URLSearchParams(window.location.search);
      if (p.get("token_hash") && p.get("type")) {
        setParams(p);
        setStage("ready-to-verify");
      } else if (window.location.hash.includes("error")) {
        const h = new URLSearchParams(window.location.hash.slice(1));
        setError(h.get("error_description")?.replace(/\+/g, " ") || "This invite link is invalid or has expired.");
        setStage("error");
      } else {
        setError("This link is missing its verification token. Open the exact link from the invite email.");
        setStage("error");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify() {
    if (!params) return;
    setError("");
    setLoading(true);
    const { data, error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: params.get("token_hash")!,
      type: params.get("type") as "invite",
    });
    setLoading(false);
    if (verifyErr) {
      console.error("[accept-invite] verifyOtp failed:", verifyErr);
      setError(`This invite link is invalid or has expired. (${verifyErr.message})`);
      setStage("error");
      return;
    }
    setEmail(data.session?.user.email ?? "");
    setStage("verified");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    await fetch("/api/accept-invite", { method: "POST" });

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session!.user.id)
      .single();

    router.push(profile?.role ? `/${profile.role}` : "/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Accept invitation</h1>

        {stage === "checking" && <p className="text-sm text-slate-500">Loading...</p>}

        {stage === "ready-to-verify" && (
          <>
            <p className="mb-6 text-sm text-slate-500">Click below to accept your invitation and continue.</p>
            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Accept invitation"}
            </button>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </>
        )}

        {stage === "verified" && (
          <>
            <p className="mb-6 text-sm text-slate-500">Set a password for {email}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">New password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Confirm password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? "Setting password..." : "Set password & continue"}
              </button>
            </form>
          </>
        )}

        {stage === "error" && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
