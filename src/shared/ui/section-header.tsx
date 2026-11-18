import type React from "react";
import { cn } from "@/shared/lib/utils";

export interface SectionHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  theme?: "lavender" | "cosmic";
  align?: "center" | "start";
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  children?: React.ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  theme = "lavender",
  align = "center",
  className,
  titleClassName,
  descriptionClassName,
  children,
}: SectionHeaderProps) {
  const isCosmic = theme === "cosmic";
  const isCenter = align === "center";

  return (
    <div
      className={cn(
        "w-full",
        isCenter ? "mx-auto max-w-[859px] text-center" : "text-start",
        className
      )}
    >
      {eyebrow && (
        <div className="mb-4 text-[15px] font-medium uppercase leading-tight tracking-[2.38px] text-primary">
          {eyebrow}
        </div>
      )}

      <h2
        className={cn(
          "[text-wrap:balance] text-[clamp(2rem,1rem+4vw,4.96875rem)] font-semibold leading-[1.02] tracking-[-0.045em]",
          isCosmic ? "text-white" : "text-cosmic-canvas",
          titleClassName
        )}
      >
        {title}
      </h2>

      {description && (
        <p
          className={cn(
            "mt-4 text-[clamp(1rem,1.146vw,1.375rem)] leading-[1.5]",
            isCenter && "mx-auto max-w-[859px]",
            isCosmic ? "text-stage-muted" : "text-cosmic-canvas",
            descriptionClassName
          )}
        >
          {description}
        </p>
      )}

      {children}
    </div>
  );
}

