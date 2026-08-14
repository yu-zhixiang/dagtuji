import WorkDetail from "@/components/my/WorkDetail";

export const metadata = { title: "作品详情" };

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkDetail id={id} />;
}
