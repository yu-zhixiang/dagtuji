import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata = { title: "个人中心" };

export default async function MyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const items = [
    { href: "/my/works", label: "我的作品", desc: "查看找图、油画、插画与高清大图", emoji: "🖼️" },
    { href: "/my/points", label: "积分中心", desc: "当前积分与积分流水", emoji: "✦" },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="dt-card mb-8 flex items-center gap-4 p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7c5cff] to-[#00c2a8] text-2xl font-bold text-white">
          {(session.nickname || session.username).slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold">
            {session.nickname || session.username}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            @{session.username}
            {session.isAdmin && (
              <span className="ml-2 rounded-full bg-[#7c5cff]/20 px-2 py-0.5 text-xs text-[#a78bfa]">
                管理员
              </span>
            )}
          </p>
          <p className="mt-2 text-amber-300">
            ✦ {session.points} 积分
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="group">
            <div className="dt-card flex h-full items-center gap-4 p-5 group-hover:-translate-y-0.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/30 text-xl">
                {item.emoji}
              </span>
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{item.desc}</p>
              </div>
            </div>
          </Link>
        ))}
        {session.isAdmin && (
          <Link href="/admin" className="group">
            <div className="dt-card flex h-full items-center gap-4 p-5 group-hover:-translate-y-0.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/30 text-xl">
                🛠️
              </span>
              <div>
                <p className="font-medium">管理后台</p>
                <p className="mt-1 text-xs text-zinc-500">订单处理与统计</p>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
