<script lang="ts">
  import { gsap } from "gsap";
  import { onMount } from "svelte";

  type Props = {
    items?: string[];
    gradientColor?: string;
  };

  let { items = [], gradientColor = "var(--background)" }: Props = $props();

  const totalItems = 28;
  const rowIndexes = [0, 1, 2, 3];
  const itemIndexes = [0, 1, 2, 3, 4, 5, 6];
  const combinedItems = $derived(
    Array.from({ length: totalItems }, (_, index) => (items.length > 0 ? items[index % items.length] : null)),
  );

  let rowElements: (HTMLDivElement | null)[] = $state([null, null, null, null]);

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function updateMotion(clientX: number): void {
      const maxMoveAmount = 300;
      const baseDuration = 0.8;
      const inertiaFactors = [0.6, 0.4, 0.3, 0.2];

      rowElements.forEach((row, index) => {
        if (!row) return;

        const direction = index % 2 === 0 ? 1 : -1;
        const moveAmount = ((clientX / window.innerWidth) * maxMoveAmount - maxMoveAmount / 2) * direction;
        gsap.to(row, {
          x: moveAmount,
          duration: baseDuration + inertiaFactors[index % inertiaFactors.length],
          ease: "power3.out",
          overwrite: "auto",
        });
      });
    }

    function handlePointerMove(event: PointerEvent): void {
      updateMotion(event.clientX);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      gsap.killTweensOf(rowElements.filter((row) => row !== null));
    };
  });
</script>

<div class="h-full w-full overflow-hidden" aria-hidden="true">
  <div
    class="relative flex h-full min-h-96 w-full items-center justify-center overflow-hidden"
    style:background={`radial-gradient(circle, ${gradientColor} 0%, transparent 70%)`}
  >
    <div
      class="grid h-[160%] w-[160%] min-w-6xl flex-none origin-center -rotate-12 grid-cols-1 grid-rows-4 gap-3 sm:gap-4"
    >
      {#each rowIndexes as rowIndex (rowIndex)}
        <div
          bind:this={rowElements[rowIndex]}
          class="grid grid-cols-7 gap-3 sm:gap-4"
          style="will-change: transform"
        >
          {#each itemIndexes as itemIndex (itemIndex)}
            {@const image = combinedItems[rowIndex * itemIndexes.length + itemIndex]}
            <div class="bg-muted relative overflow-hidden" data-grid-motion-item>
              {#if image}
                <div class="absolute inset-0 bg-cover bg-center" style:background-image={`url("${image}")`}></div>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>
