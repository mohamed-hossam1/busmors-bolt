import { MARKETING_ASSETS } from "../model/assets";

export interface PondRippleProps {
  size?: "lg" | "md";
}

export function PondRipple({ size = "lg" }: PondRippleProps) {
  const rippleClass = size === "lg" ? "h-[320px] w-[320px]" : "h-[210px] w-[210px]";
  const ringClass = size === "lg" ? "h-[300px] w-[300px]" : "h-[190px] w-[190px]";

  return (
    <>
      <img
        src={MARKETING_ASSETS.waveEffect}
        alt=""
        aria-hidden
        className={`pond-ripple ${rippleClass}`}
      />
      <img
        src={MARKETING_ASSETS.waveEffect}
        alt=""
        aria-hidden
        className={`pond-ripple ${rippleClass}`}
        style={{ animationDelay: "2.1s" }}
      />
      <span aria-hidden className={`pond-ring ${ringClass}`} />
      <span aria-hidden className={`pond-ring ${ringClass}`} style={{ animationDelay: "1.4s" }} />
      <span aria-hidden className={`pond-ring ${ringClass}`} style={{ animationDelay: "2.8s" }} />
    </>
  );
}

