import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, size = "default", variant = "default", ...props }: React.ComponentProps<"div"> & { size?: "default" | "sm"; variant?: "default" | "stat" | "achievement" }) {
  return <div data-slot="card" data-size={size} data-variant={variant} className={cn("game-surface rounded-lg border border-zinc-800 bg-zinc-950 text-sm text-card-foreground [--card-padding:1.5rem]", size === "sm" && "[--card-padding:1rem]", variant !== "default" && "stat-card relative rounded-sm", variant === "achievement" && "achievement-card", className)} {...props} />;
}
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-2 p-[var(--card-padding)]", className)} {...props} />;
}
function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="card-title" className={cn("text-lg font-semibold leading-snug tracking-tight", className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-[var(--card-padding)] [&:not(:first-child)]:pt-0", className)} {...props} />;
}
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex flex-wrap items-center gap-3 border-t border-zinc-800 p-[var(--card-padding)]", className)} {...props} />;
}
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("self-end", className)} {...props} />;
}
export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
