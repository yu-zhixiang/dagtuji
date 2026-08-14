import Link from "next/link";
import LogoutButton from "@/components/ui/LogoutButton";
import MobileMenu from "./MobileMenu";
import { getSession } from "@/lib/session";
import { SITE_NAME } from "@/lib/constants";

const NAV = [
  { href: "/find-image", label: "找图" },
  { href: "/upscale", label: "高清大图" },
  { href: "/oil-painting", label: "油画风格" },
  { href: "/illustration", label: "插画风格" },
];

export default async function Header() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#00c2a8] text-lg font-bold text-white">
            找
          </span>
          <span className="text-xl font-bold tracking-wide">{SITE_NAME}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {session ? (
            <>
              <Link
                href="/my/works"
                className="hidden rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white sm:block"
              >
                我的作品
              </Link>
              <Link
                href="/my/points"
                className="hidden rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white sm:block"
              >
                积分
              </Link>
              <Link
                href="/my"
                className="hidden rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white sm:block"
              >
                个人中心
              </Link>
              <Link
                href="/my/points"
                className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-amber-300 sm:flex"
              >
                <span className="text-base leading-none">✦</span>
                {session.points} 积分
              </Link>
              {session.isAdmin && (
                <Link
                  href="/admin"
                  className="hidden rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:border-[#3a3a44] sm:block"
                >
                  管理后台
                </Link>
              )}
              <LogoutButton className="hidden sm:block" />
            </>
          ) : (
            <Link
              href="/login"
              className="btn-primary !px-4 !py-2 text-sm"
            >
              登录 / 注册
            </Link>
          )}
          <MobileMenu session={session} />
        </div>
      </div>
    </header>
  );
}
