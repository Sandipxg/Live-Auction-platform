import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentUser, DEMO_PASSWORD, DEMO_USERS } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Only allow same-site relative paths, so `?next=` cannot redirect off-site. */
function safeNext(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return <LoginForm next={next} demoUsers={DEMO_USERS} demoPassword={DEMO_PASSWORD} />;
}
