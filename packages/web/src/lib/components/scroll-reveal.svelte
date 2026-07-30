<script lang="ts">
  import { gsap } from "gsap";
  import { ScrollTrigger } from "gsap/ScrollTrigger";
  import { onMount, type Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
  let element: HTMLDivElement;

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const animation = gsap.from(element, {
      opacity: 0,
      y: 32,
      duration: 1,
      ease: "power3.out",
      clearProps: "opacity,transform",
      scrollTrigger: {
        trigger: element,
        start: "top 85%",
        once: true,
      },
    });

    return () => {
      animation.scrollTrigger?.kill();
      animation.kill();
      gsap.set(element, { clearProps: "opacity,transform" });
    };
  });
</script>

<div bind:this={element} class="h-full">
  {@render children()}
</div>
