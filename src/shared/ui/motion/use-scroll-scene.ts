
import { useEffect, useRef, type RefObject } from "react";

type ScrollMode = "contained" | "cover";

type ScrollSceneOptions = {
  mode?: ScrollMode;
  disabledBelow?: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A deliberately small scroll controller for the three presentation scenes on
 * this page. It writes directly to element styles inside requestAnimationFrame,
 * avoiding React renders and the cost of a general-purpose animation runtime.
 */
export function useScrollScene(
  root: RefObject<HTMLElement | null>,
  update: (progress: number, reducedMotion: boolean) => void,
  { mode = "contained", disabledBelow = 0 }: ScrollSceneOptions = {},
) {
  const updateRef = useRef(update);

  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    let reducedStateApplied = false;

    const render = () => {
      frame = 0;
      const reducedMotion = motionQuery.matches || window.innerWidth < disabledBelow;

      if (reducedMotion) {
        if (!reducedStateApplied) {
          updateRef.current(0, true);
          reducedStateApplied = true;
        }
        return;
      }

      reducedStateApplied = false;

      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight;
      const progress =
        mode === "cover"
          ? (viewport - rect.top) / (viewport + rect.height)
          : -rect.top / Math.max(rect.height - viewport, 1);

      updateRef.current(clamp(progress), false);
    };

    const requestRender = () => {
      if (!visible || frame) return;
      frame = window.requestAnimationFrame(render);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) requestRender();
      },
      { rootMargin: "100px 0px" },
    );

    observer.observe(element);
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", requestRender, { passive: true });
    motionQuery.addEventListener("change", requestRender);
    render();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", requestRender);
      motionQuery.removeEventListener("change", requestRender);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [disabledBelow, mode, root]);
}

export function interpolate(
  progress: number,
  input: readonly number[],
  output: readonly number[],
) {
  let index = 0;
  while (index < input.length - 2 && progress > input[index + 1]) index += 1;
  const start = input[index];
  const end = input[index + 1];
  const local = clamp((progress - start) / Math.max(end - start, Number.EPSILON));
  return output[index] + (output[index + 1] - output[index]) * local;
}
