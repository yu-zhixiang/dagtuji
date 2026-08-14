import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

const CARDS = [
  {
    href: "/find-image",
    title: "找图",
    desc: "输入关键词，快速找到满意的图片",
    cost: "2积分/次",
    btn: "找图",
    emoji: "🔍",
    gradient: "from-[#7c5cff] to-[#a78bfa]",
  },
  {
    href: "/upscale",
    title: "高清大图",
    desc: "生成超清大图，细节丰富",
    cost: "100积分/张",
    btn: "上传图片",
    emoji: "🖼️",
    gradient: "from-[#00c2a8] to-[#34d399]",
  },
  {
    href: "/oil-painting",
    title: "图片改油画",
    desc: "把图片变成艺术油画质感",
    cost: "10积分/张",
    btn: "上传图片",
    emoji: "🎨",
    gradient: "from-[#f59e0b] to-[#fbbf24]",
  },
  {
    href: "/illustration",
    title: "图片改插画",
    desc: "把图片变成清新插画风格",
    cost: "10积分/张",
    btn: "上传图片",
    emoji: "✏️",
    gradient: "from-[#ec4899] to-[#f472b6]",
  },
];

export default function Home() {
  return (
    <div className="relative">
      {/* 顶部渐变光晕 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% -10%, rgba(124,92,255,0.25), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-16">
        {/* 品牌区 */}
        <section className="pb-14 pt-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="brand-gradient">{SITE_NAME}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400">
            海量图片 · 一站获取
            <br />
            找图、高清大图、图片改油画、图片改插画
          </p>
        </section>

        {/* 4 大功能卡片 */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card) => (
            <Link key={card.href} href={card.href} className="group">
              <div className="dt-card flex h-full flex-col p-6 group-hover:-translate-y-1">
                <div
                  className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${card.gradient} text-2xl`}
                >
                  {card.emoji}
                </div>
                <h2 className="text-lg font-semibold">{card.title}</h2>
                <p className="mt-2 flex-1 text-sm text-zinc-400">{card.desc}</p>
                <div className="mt-5 flex items-center justify-between">
                  <span className="text-xs text-amber-300">{card.cost}</span>
                  <span className="btn-primary !rounded-lg !px-4 !py-2 text-sm">
                    {card.btn}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>

        {/* 特点 */}
        <section className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { title: "人工精选", desc: "每张图片由专人处理审核，保证质量" },
            { title: "高清大图", desc: "超清大图，细节清晰呈现" },
            { title: "简单好用", desc: "无需复杂操作，几步即可完成" },
          ].map((f) => (
            <div key={f.title} className="dt-card p-5 text-center">
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-zinc-500">{f.desc}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
