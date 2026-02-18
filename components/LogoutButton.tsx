"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton({ variant = "light" }: { variant?: "light" | "dark" }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isDark = variant === "dark";

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: "5px 12px",
        borderRadius: 6,
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0"}`,
        background: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
        color: isDark ? "#94A3B8" : "#64748B",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        transition: "all 0.15s",
      }}
    >
      Sign Out
    </button>
  );
}
