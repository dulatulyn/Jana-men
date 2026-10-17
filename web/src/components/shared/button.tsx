import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

type Variant = "primary" | "mint" | "outline" | "ghost" | "danger" | "white";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-jm-green text-white hover:bg-jm-green-strong disabled:bg-[#a9cfa8]",
  mint: "bg-jm-mint text-jm-green-strong hover:bg-[#cdf3de]",
  outline: "border border-jm-line bg-white text-jm-ink hover:border-jm-light hover:text-jm-green-strong",
  ghost: "text-jm-green-strong hover:bg-jm-mint/60",
  danger: "bg-jm-red-bg text-jm-red hover:bg-[#fadbd8]",
  white: "bg-white text-jm-green-strong hover:bg-jm-mint",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[14px] gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-[52px] px-6 text-[16px] gap-2",
};

export function Btn({
  variant = "primary",
  size = "md",
  asChild,
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-[18px] [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
