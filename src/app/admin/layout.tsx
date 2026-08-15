import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const ADMIN_NAV = [
  { href: "/admin", label: "概览" },
  { href: "/admin/orders", label: "找图订单" },
  { href: "/admin/upscale", label: "高清大图订单" },
  { href: "/admin/styles", label: "风格订单" },
  { href: "/admin/review", label: "风控审核" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          管理<span className="brand-gradient">后台</span>
        </h1>
      </div>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {ADMIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
