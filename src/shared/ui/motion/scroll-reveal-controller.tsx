
import { useEffect } from "react";
import "./scroll-reveal.css";

/** Enhances visible server content; never requires JavaScript to reveal it. */
export function ScrollRevealController() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".scroll-reveal"));
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.removeAttribute("data-reveal-pending");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const revealAll = () => {
      observer.disconnect();
      elements.forEach((element) => element.removeAttribute("data-reveal-pending"));
    };

    elements.forEach((element) => {
      // Do not hide content already in view when hydration finishes.
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      observer.observe(element);
      element.setAttribute("data-reveal-pending", "");
    });
    motionQuery.addEventListener("change", revealAll);

    return () => {
      revealAll();
      motionQuery.removeEventListener("change", revealAll);
    };
  }, []);

  return null;
}
