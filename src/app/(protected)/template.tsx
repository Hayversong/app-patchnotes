import { RouteTransition } from "@/components/route-transition";

export default function ProtectedTemplate({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
