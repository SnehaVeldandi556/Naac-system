"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";

type Stage = "checking" | "ready-to-respond" | "set-password" | "declined" | "error";

export default function AcceptInvitePage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    // 1. Listen for session changes (handles #access_token=... from Supabase invite emails)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setEmail(session.user.email ?? "");
        setStage("ready-to-respond");
      }
    });

    // 2. Check initial session or URL parameters
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setEmail(data.session.user.email ?? "");
        setStage("ready-to-respond");
        return;
      }

      const p = new URLSearchParams(window.location.search);
      setParams(p);

      if (p.get("action") === "reject") {
        setStage("ready-to-respond");
        return;
      }

      if (p.get("token_hash") && p.get("type")) {
        setStage("ready-to-respond");
      } else if (window.location.hash.includes("access_token")) {
        // Hash contains tokens; Supabase client is parsing it asynchronously
        setStage("ready-to-respond");
      } else if (window.location.hash.includes("error")) {
        const h = new URLSearchParams(window.location.hash.slice(1));
        setError(
          h.get("error_description")?.replace(/\+/g, " ") ||
            "This invite link is invalid or has expired."
        );
        setStage("error");
      } else {
        setError("This link is missing its verification token. Open the exact link from your invitation email.");
        setStage("error");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAccept() {
    setError("");
    setLoading(true);

    // If session is already established (e.g. from hash token in email)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      setEmail(session.user.email ?? "");
      setStage("set-password");
      setLoading(false);
      return;
    }

    // Otherwise verify with query token_hash
    const tokenHash = params?.get("token_hash");
    const type = (params?.get("type") as "invite") || "invite";

    if (tokenHash) {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      setLoading(false);
      if (verifyErr) {
        console.error("[accept-invite] verifyOtp failed:", verifyErr);
        setError(`This invite link is invalid or has expired. (${verifyErr.message})`);
        setStage("error");
        return;
      }

      setEmail(data.session?.user.email ?? "");
      setStage("set-password");
      return;
    }

    setLoading(false);
    setError("Could not verify invitation token. Please reopen the link from your email.");
    setStage("error");
  }

  async function handleDecline() {
    if (typeof window !== "undefined" && !window.confirm("Are you sure you want to decline this invitation?")) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const tokenHash = params?.get("token_hash");
      const res = await fetch("/api/reject-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, email }),
      });

      if (res.ok) {
        setStage("declined");
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to decline invitation.");
      }
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      return setError("Password must be at least 8 characters.");
    }
    if (password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await fetch("/api/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: session?.user?.id,
          email: session?.user?.email,
        }),
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session!.user.id)
        .single();

      const roleRoot = profile?.role ? `/${profile.role}` : "/login";
      router.push(roleRoot);
      router.refresh();
    } catch (err) {
      console.error("Error finalizing profile acceptance:", err);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">NAAC Report Portal</p>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Portal Invitation</h1>
        </div>

        {stage === "checking" && (
          <div className="py-6 text-center text-sm text-slate-500">Verifying invitation details...</div>
        )}

        {stage === "ready-to-respond" && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600 leading-relaxed text-center">
              You have been invited to join the <strong>NAAC Report Portal</strong>. Please respond to accept or decline access.
            </p>

            {email && (
              <div className="text-center">
                <span className="inline-block px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700">
                  {email}
                </span>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <button
                onClick={handleAccept}
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
              >
                {loading ? "Processing..." : "✓ Accept Invitation & Set Password"}
              </button>

              <button
                onClick={handleDecline}
                disabled={loading}
                className="w-full rounded-lg border border-rose-300 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                ✕ Decline Invitation
              </button>
            </div>

            {error && <p className="text-center text-xs text-rose-600 font-medium">{error}</p>}
          </div>
        )}

        {stage === "set-password" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
              Invitation accepted! Set a password for <strong>{email}</strong> to activate your login.
            </div>

            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">New Password</label>
                <input
                  type="password"
                  required
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Confirm Password</label>
                <input
                  type="password"
                  required
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
              >
                {loading ? "Activating account..." : "Set Password & Continue to Portal"}
              </button>
            </form>
          </div>
        )}

        {stage === "declined" && (
          <div className="py-4 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xl font-bold">
              ✕
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Invitation Declined</h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                You have declined the invitation. No account has been created, and the invitation has been cancelled.
              </p>
            </div>
            <a
              href="/login"
              className="inline-block text-xs font-semibold text-slate-900 underline hover:text-slate-700"
            >
              Return to Sign In
            </a>
          </div>
        )}

        {stage === "error" && (
          <div className="py-4 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 text-xl font-bold">
              !
            </div>
            <p className="text-xs text-rose-600 font-medium">{error}</p>
            <a
              href="/login"
              className="inline-block text-xs font-semibold text-slate-900 underline hover:text-slate-700"
            >
              Return to Sign In
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
