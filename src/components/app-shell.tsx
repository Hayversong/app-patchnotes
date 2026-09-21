"use client";

import { BookOpenText, ChevronLeft, ChevronRight, Cpu, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SidebarLabel } from "@/components/motion-primitives/sidebar-label";
import { TransitionPanel } from "@/components/motion-primitives/transition-panel";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCurrentUserQuery } from "@/modules/auth/hooks/use-auth";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Assistente", icon: Cpu },
  { href: "/devlog", label: "Devlog", icon: BookOpenText },
  { href: "/profile", label: "Perfil", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const storedUser = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const currentUser = useCurrentUserQuery();
  const user = storedUser ?? currentUser.data;
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleLabel = collapsed ? "Expandir menu" : "Recolher menu";
  const reduced = useReducedMotion();

  useEffect(() => {
    if (currentUser.data) setUser(currentUser.data);
  }, [currentUser.data, setUser]);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [router, token]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <TooltipProvider delay={200}>
    <motion.div initial={false} animate={{ "--sidebar-width": collapsed ? "80px" : "256px" }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 32 }}
      className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:p-3">Pular para o conteúdo</a>
      <aside aria-label="Menu lateral" className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col overflow-y-auto overflow-x-hidden border-r border-zinc-800 bg-zinc-950 px-3 py-5 md:flex">
        <div className={cn("flex h-28 shrink-0 gap-3", collapsed ? "flex-col items-center justify-center" : "items-center justify-between")}>
          <Link href="/dashboard" aria-label="Patchnotes — Dashboard" className="flex h-11 min-w-0 items-center px-2 font-mono text-sm font-semibold tracking-[0.18em] text-lime-400">
            <TransitionPanel activeIndex={collapsed ? 0 : 1} className="relative overflow-hidden">
              {[<span key="mark" aria-hidden="true" className="text-xl">P<span className="text-xs">/</span></span>, <span key="name">PATCHNOTES</span>]}
            </TransitionPanel>
          </Link>
          <Tooltip label={toggleLabel}>
            <Button variant="ghost" size="icon" aria-label={toggleLabel} aria-expanded={!collapsed} aria-controls="desktop-navigation" onClick={toggleSidebar}>
              {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
            </Button>
          </Tooltip>
        </div>
        <nav id="desktop-navigation" aria-label="Navegação principal" className="mb-6 mt-8 shrink-0 space-y-2">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Tooltip key={href} label={label} enabled={collapsed}>
              <Link href={href} aria-label={label} aria-current={pathname === href ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-md border border-transparent px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-foreground", collapsed && "justify-center px-0", pathname === href && "border-lime-400/20 bg-zinc-900 text-lime-400")}>
                <Icon aria-hidden="true" className="size-5 shrink-0" /><SidebarLabel collapsed={collapsed}>{label}</SidebarLabel>
              </Link>
            </Tooltip>
          ))}
        </nav>
        <div className="mt-auto shrink-0 border-t border-zinc-800 pt-4">
          <div className={cn("flex items-center", collapsed && "justify-center")}>
            <Avatar name={user?.name} src={user?.avatarUrl} />
            <SidebarLabel collapsed={collapsed}><span className="block truncate text-sm font-medium">{user?.name ?? (currentUser.isError ? "Conta indisponível" : "Carregando...")}</span><span className="block truncate text-xs text-zinc-500">{user?.email}</span></SidebarLabel>
          </div>
          <Tooltip label="Sair" enabled={collapsed}>
            <Button variant="ghost" aria-label="Sair da conta" className={cn("mt-3 w-full gap-0 text-zinc-400", !collapsed && "justify-start")} onClick={logout}><LogOut aria-hidden="true" /><SidebarLabel collapsed={collapsed}>Sair</SidebarLabel></Button>
          </Tooltip>
        </div>
      </aside>
      <div className="md:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 flex border-b border-zinc-800 bg-background px-2 py-2 md:hidden">
          <nav aria-label="Navegação principal" className="flex w-full items-center justify-around gap-1">
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] text-zinc-500", pathname === href && "text-lime-400")}><Icon aria-hidden="true" className="size-5" />{label}</Link>
            ))}
            <Button variant="ghost" aria-label="Sair da conta" onClick={logout} className="h-auto min-h-11 flex-col gap-1 px-2 py-2 text-[10px] text-zinc-400"><LogOut aria-hidden="true" className="size-5" />Sair</Button>
          </nav>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto min-w-0 max-w-6xl px-4 py-8 outline-none sm:px-6 lg:px-8">
          {currentUser.isError && <div className="mb-6"><ErrorState message="Não foi possível atualizar os dados da sua conta." pending={currentUser.isFetching} retry={() => void currentUser.refetch()} /></div>}
          {children}
        </main>
      </div>
    </motion.div>
    </TooltipProvider>
  );
}
