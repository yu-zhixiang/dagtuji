import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { REGISTER_BONUS_POINTS } from "@/lib/constants";
import AuthForm from "./AuthForm";

export const metadata = { title: "登录 / 注册" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="brand-gradient">欢迎来到大图集</span>
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          新用户注册即送 {REGISTER_BONUS_POINTS} 积分
        </p>
      </div>
      <AuthForm />
    </div>
  );
}
