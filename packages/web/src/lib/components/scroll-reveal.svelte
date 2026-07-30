<script lang="ts">
  import { gsap } from "gsap";
  import { ScrollTrigger } from "gsap/ScrollTrigger";
  import type { Snippet } from "svelte";

  let { children, enabled = true }: { children: Snippet; enabled?: boolean } = $props();
  let element: HTMLDivElement;

  $effect(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const animation = gsap.fromTo(
      element,
      { opacity: 0, y: 32 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: "power3.out",
        clearProps: "opacity,transform",
        scrollTrigger: {
          trigger: element,
          start: "top 85%",
          once: true,
        },
      },
    );

    return () => {
      animation.scrollTrigger?.kill();
      animation.kill();
      gsap.set(element, { clearProps: "opacity,transform" });
    };
  });
</script>

<div
  bind:this={element}
  class="h-full"
  style:opacity={enabled ? undefined : 0}
  style:transform={enabled ? undefined : "translateY(32px)"}
  inert={!enabled}
>
  {@render children()}
</div>
