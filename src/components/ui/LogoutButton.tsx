"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={`cursor-pointer rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-50 ${className || ""}`}
    >
      {loading ? "退出中…" : "退出"}
    </button>
  );
}
