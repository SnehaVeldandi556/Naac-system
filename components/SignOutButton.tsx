"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";

export default function SignOutButton() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  async function handleSignOut() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      await fetch("/api/logout-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: session.user.id }),
      });
    }
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
    >
      Sign out
    </button>
  );
}
