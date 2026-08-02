import { Outlet, useLocation } from "react-router-dom";
import { BottomTabBar } from "../ui/BottomTabBar";
import { PageHeader } from "../ui/PageHeader";

export function LightShell() {
  const location = useLocation();
  const titleByPath: Record<string, string> = {
    "/home": "今日",
    "/training": "训练",
    "/growth": "成长",
    "/me": "我的",
  };

  return (
    <div data-shell="light" className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[1120px] flex-col">
        <PageHeader title={location.pathname.startsWith("/training/") ? "训练" : titleByPath[location.pathname] ?? "言序"} action="notifications" />
        <main className="flex-1 pb-[calc(var(--tabbar-height)+var(--safe-bottom)+24px)]">
          <Outlet />
        </main>
        <BottomTabBar />
      </div>
    </div>
  );
}
