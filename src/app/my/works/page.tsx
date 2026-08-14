import WorksViewer from "@/components/my/WorksViewer";

export const metadata = { title: "我的作品" };

export default function MyWorksPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">
        我的<span className="brand-gradient">作品</span>
      </h1>
      <WorksViewer />
    </div>
  );
}
