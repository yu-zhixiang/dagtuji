"use client";

import { useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/ui/LogoutButton";
import type { SessionUser } from "@/types";

const NAV = [
  { href: "/find-image", label: "找图" },
  { href: "/upscale", label: "高清大图" },
  { href: "/oil-painting", label: "油画风格" },
  { href: "/illustration", label: "插画风格" },
];

export default function MobileMenu({
  session,
}: {
  session: SessionUser | null;
}) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <div className="relative md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-zinc-300"
        aria-label="菜单"
      >
        <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex flex-col p-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="rounded-xl px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/5"
              >
                {item.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            {session ? (
              <>
                <Link
                  href="/my"
                  onClick={close}
                  className="rounded-xl px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/5"
                >
                  个人中心
                </Link>
                <Link
                  href="/my/works"
                  onClick={close}
                  className="rounded-xl px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/5"
                >
                  我的作品
                </Link>
                <Link
                  href="/my/points"
                  onClick={close}
                  className="rounded-xl px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/5"
                >
                  积分 · <span className="text-amber-300">{session.points}</span>
                </Link>
                {session.isAdmin && (
                  <Link
                    href="/admin"
                    onClick={close}
                    className="rounded-xl px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/5"
                  >
                    管理后台
                  </Link>
                )}
                <div className="px-4 py-2">
                  <LogoutButton className="w-full !bg-card !text-left !px-0" />
                </div>
              </>
            ) : (
              <Link
                href="/login"
                onClick={close}
                className="btn-primary m-2"
              >
                登录 / 注册
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
