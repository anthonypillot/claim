<script lang="ts">
  import StoreLogo from "$lib/components/store-logo.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Toggle } from "$lib/components/ui/toggle";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import type { StoreCounts, StoreFilter } from "$lib/giveaways/filters";
  import { formatStore, STORE_IDS } from "$lib/giveaways/model";
  import { Clock01Icon, MenuSquareIcon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/svelte";

  let {
    counts,
    selectedStore,
    endingSoon,
    onStoreChange,
    onEndingSoonChange,
  }: {
    counts: StoreCounts;
    selectedStore: StoreFilter;
    endingSoon: boolean;
    onStoreChange: (store: StoreFilter) => void;
    onEndingSoonChange: (endingSoon: boolean) => void;
  } = $props();

  function updateSelectedStore(value: string): void {
    if (value === "all") {
      onStoreChange(value);
      return;
    }

    const store = STORE_IDS.find((storeId) => storeId === value);
    if (store) onStoreChange(store);
  }

  function countLabel(count: number): string {
    return `${count} ${count === 1 ? "giveaway" : "giveaways"}`;
  }
</script>

<section aria-labelledby="giveaway-filters-title" class="min-w-0">
  <h2 id="giveaway-filters-title" class="sr-only">Filter and sort giveaways</h2>
  <div class="grid grid-cols-2 gap-2 lg:flex lg:items-center lg:gap-4">
    <ToggleGroup.Root
      type="single"
      variant="outline"
      spacing={2}
      class="col-span-2 grid w-full grid-cols-2 lg:flex lg:w-fit lg:gap-0"
      aria-label="Filter by store"
      bind:value={() => selectedStore, updateSelectedStore}
    >
      <ToggleGroup.Item
        value="all"
        aria-label={`All stores, ${countLabel(counts.all)}`}
        class="col-span-2 h-11 w-full gap-1 px-2 data-[state=on]:z-10 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary sm:gap-2.5 sm:px-4 lg:col-span-1 lg:w-auto"
      >
        <HugeiconsIcon icon={MenuSquareIcon} />
        <span>All stores</span>
        <Badge variant="secondary" aria-hidden="true">{counts.all}</Badge>
      </ToggleGroup.Item>
      {#each STORE_IDS as store}
        <ToggleGroup.Item
          value={store}
          aria-label={`${formatStore(store)}, ${countLabel(counts[store])}`}
          class="h-11 w-full gap-1 px-2 text-xs data-[state=on]:z-10 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary sm:gap-2.5 sm:px-4 sm:text-sm lg:-ml-px lg:w-auto"
        >
          <StoreLogo {store} class="size-4 sm:size-5" />
          <span>{formatStore(store)}</span>
          <Badge variant="secondary" aria-hidden="true">{counts[store]}</Badge>
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>

    <Toggle
      variant="outline"
      bind:pressed={() => endingSoon, onEndingSoonChange}
      class="col-span-2 h-11 w-full gap-2.5 px-4 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary lg:ml-auto lg:w-auto lg:shrink-0"
      aria-label="Sort by ending soon"
    >
      <HugeiconsIcon icon={Clock01Icon} data-icon="inline-start" />
      Ending soon
    </Toggle>
  </div>
</section>
