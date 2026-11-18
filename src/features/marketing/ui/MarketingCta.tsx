import type React from "react";
import { Link } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

export type MarketingCtaSize = "default" | "lg" | "wide";

export interface MarketingCtaProps extends React.ComponentPropsWithoutRef<typeof Link> {
  size?: MarketingCtaSize;
  labelClassName?: string;
}

const sizeClasses: Record<MarketingCtaSize, string> = {
  default: "h-14 min-h-14 w-[230px] max-w-full text-[15px]",
  lg: "h-[72px] w-[264px] max-w-full text-[18px]",
  wide: "marketing-led-cta-wide h-[71px] w-full shrink-0 text-[17.8875px]",
};

export function MarketingCta({
  href,
  children,
  size = "default",
  className,
  labelClassName,
  ...props
}: MarketingCtaProps) {
  return (
    <Link
      href={href}
      className={cn(
        "marketing-led-cta relative inline-flex items-center justify-center rounded-full font-medium leading-[1.2] text-white transition-transform active:scale-[0.98]",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      <span
        className={cn("marketing-led-cta-label", labelClassName)}
      >
        {children}
      </span>
    </Link>
  );
}

