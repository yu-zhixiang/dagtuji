import { SITE_NAME } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-center">
        <p className="text-sm text-zinc-400">
          {SITE_NAME} — 海量图片，一站获取
        </p>
        <p className="text-xs text-zinc-600">
          © {new Date().getFullYear()} {SITE_NAME} · 图片由人工审核处理
        </p>
      </div>
    </footer>
  );
}
