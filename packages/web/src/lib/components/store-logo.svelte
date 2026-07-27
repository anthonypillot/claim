<script lang="ts">
  import type { StoreId } from "$lib/giveaways/model";
  import { cn } from "$lib/utils";

  const STORE_LOGOS = {
    "epic-games": "/stores/epic-games.svg",
    "prime-gaming": "/stores/prime-gaming.svg",
    gog: "/stores/gog.svg",
    steam: "/stores/steam.svg",
  } satisfies Record<StoreId, string>;

  let { store, class: className }: { store: StoreId; class?: string } = $props();
</script>

<img
  src={STORE_LOGOS[store]}
  alt=""
  aria-hidden="true"
  class={cn("size-4 shrink-0 object-contain", store === "gog" && "rounded-sm bg-white p-0.5", className)}
/>
