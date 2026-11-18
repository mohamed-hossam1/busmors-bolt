import type React from "react";
import { cn } from "@/shared/lib/utils";

export interface MarketingCardProps extends React.ComponentPropsWithoutRef<"div"> {
  theme?: "light" | "trial";
}

export function MarketingCard({
  className,
  theme = "light",
  ...props
}: MarketingCardProps) {
  return (
    <div
      className={cn(
        "marketing-container relative flex min-w-0 flex-col rounded-2xl border border-white",
        theme === "light" && "marketing-light-card",
        theme === "trial" && "feature-overview-trial text-white",
        className
      )}
      {...props}
    />
  );
}

export function MarketingCardHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mt-4 ps-4", className)} {...props} />;
}

export function MarketingCardTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"h3">) {
  return (
    <h3
      className={cn(
        "text-[clamp(26px,1.667vw,31.8px)] font-semibold leading-[1.4] text-cosmic-canvas",
        className
      )}
      {...props}
    />
  );
}

export function MarketingCardDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "mt-2 text-[15.9px] leading-[1.5] tracking-[-0.02em] text-slate-structure",
        className
      )}
      {...props}
    />
  );
}

