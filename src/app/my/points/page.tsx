import PointsViewer from "@/components/my/PointsViewer";

export const metadata = { title: "积分中心" };

export default function MyPointsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">
        积分<span className="brand-gradient">中心</span>
      </h1>
      <PointsViewer />
    </div>
  );
}
