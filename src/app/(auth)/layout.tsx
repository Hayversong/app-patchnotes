import { AuthRouteTransition } from "@/modules/auth/components/auth-route-transition";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthRouteTransition>{children}</AuthRouteTransition>;
}
