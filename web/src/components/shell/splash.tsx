import { Logo } from "@/components/brand/logo";

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-jm-page">
      <div className="animate-pulse">
        <Logo size={40} />
      </div>
    </div>
  );
}
