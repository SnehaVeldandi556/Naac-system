import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/supabaseServer";

export default async function RootPage() {
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profile?.role === "admin") {
    redirect("/admin");
  } else if (profile?.role === "hod") {
    redirect("/hod");
  } else if (profile?.role === "faculty") {
    redirect("/faculty");
  }

  redirect("/login");
}