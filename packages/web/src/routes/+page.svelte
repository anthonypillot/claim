<script lang="ts">
  import { pushState } from "$app/navigation";
  import { page } from "$app/state";
  import BrandLogo from "$lib/components/brand-logo.svelte";
  import GiveawayCard from "$lib/components/giveaway-card.svelte";
  import GiveawayFilters from "$lib/components/giveaway-filters.svelte";
  import GridMotion from "$lib/components/grid-motion.svelte";
  import ScrollReveal from "$lib/components/scroll-reveal.svelte";
  import * as Alert from "$lib/components/ui/alert";
  import * as Empty from "$lib/components/ui/empty";
  import {
    createGiveawayFilterUrl,
    filterAndSortGiveaways,
    getStoreCounts,
    parseGiveawayFilters,
    type GiveawayFilters as GiveawayFilterState,
    type StoreFilter,
  } from "$lib/giveaways/filters";
  import { formatStore, getGiveawayImage } from "$lib/giveaways/model";
  import { AlertCircleIcon, GiftIcon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { gsap } from "gsap";
  import { ScrollTrigger } from "gsap/ScrollTrigger";
  import { onMount, tick } from "svelte";
  import type { PageProps } from "./$types";

  let { data, updateFilterUrl = pushFilterUrl }: PageProps & { updateFilterUrl?: (url: URL) => void } = $props();

  let filters = $state(parseGiveawayFilters(page.url.searchParams));
  let updatedAt = $state<number>();
  let heroReady = $state(false);
  let heroGrid: HTMLDivElement;
  let heroTint: HTMLDivElement;
  let heroGradient: HTMLDivElement;
  let heroContent: HTMLDivElement;
  const now = $derived(updatedAt ?? data.loadedAt);
  const storeCounts = $derived(getStoreCounts(data.items.giveaways));
  const visibleGiveaways = $derived(filterAndSortGiveaways(data.items.giveaways, filters));
  const giveawayArtwork = $derived(
    data.items.giveaways.flatMap((giveaway) => {
      const image = getGiveawayImage(giveaway.images);
      return image ? [image] : [];
    }),
  );

  onMount(() => {
    const timer = window.setInterval(() => {
      updatedAt = Date.now();
    }, 60_000);

    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: reduce)", () => {
      heroReady = true;
    });
    media.add("(prefers-reduced-motion: no-preference)", () => {
      heroReady = false;
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(heroGrid, {
          opacity: 0,
          scale: 60,
          duration: 4,
          clearProps: "opacity,transform",
        })
        .from(
          [heroTint, heroGradient],
          {
            opacity: 0,
            duration: 2,
            stagger: 0.5,
            clearProps: "opacity",
          },
          0.08,
        )
        .from(
          Array.from(heroContent.children),
          {
            opacity: 0,
            y: 20,
            duration: 2,
            stagger: 0.5,
            clearProps: "opacity,transform",
          },
          0.18,
        )
        .call(
          () => {
            heroReady = true;
          },
          [],
          1,
        );
    });

    return () => {
      window.clearInterval(timer);
      media.revert();
    };
  });

  $effect(() => {
    filters = parseGiveawayFilters(page.url.searchParams);
  });

  $effect(() => {
    const giveawayOrder = visibleGiveaways.map((giveaway) => `${giveaway.store}:${giveaway.id}`).join(",");
    if (!giveawayOrder) return;

    let cancelled = false;
    void tick().then(() => {
      if (!cancelled) ScrollTrigger.refresh();
    });

    return () => {
      cancelled = true;
    };
  });

  function pushFilterUrl(url: URL): void {
    pushState(url, page.state);
  }

  function updateFilters(nextFilters: GiveawayFilterState): void {
    filters = nextFilters;
    updateFilterUrl(createGiveawayFilterUrl(page.url, nextFilters));
  }

  function updateSelectedStore(store: StoreFilter): void {
    updateFilters({ ...filters, store });
  }

  function updateEndingSoon(endingSoon: boolean): void {
    updateFilters({ ...filters, sort: endingSoon ? "ending-soon" : "default" });
  }
</script>

<svelte:head>
  <title>Giveaways | Claim</title>
  <meta name="description" content="Discover free-to-keep games available now across major storefronts." />
</svelte:head>

<main class="mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-10 sm:px-8 lg:py-14">
  <section
    aria-labelledby="page-title"
    class="relative isolate min-h-96 overflow-hidden border"
    data-testid="giveaway-hero"
  >
    <div bind:this={heroGrid} class="absolute inset-0 -z-20">
      <GridMotion items={giveawayArtwork} />
    </div>
    <div bind:this={heroTint} class="bg-background/50 absolute inset-0 -z-10"></div>
    <div
      bind:this={heroGradient}
      class="from-background via-background/70 absolute inset-0 -z-10 bg-linear-to-r to-transparent sm:w-4/5"
    ></div>
    <div
      bind:this={heroContent}
      class="flex min-h-96 max-w-2xl flex-col items-start justify-center gap-3 px-6 py-12 sm:px-10"
    >
      <BrandLogo kind="lockup" alt="Claim" class="mb-3 h-auto w-64 sm:w-80" />
      <p class="text-primary text-sm font-medium tracking-widest uppercase">Free to claim, free to keep</p>
      <h1 id="page-title" class="font-heading text-4xl font-bold tracking-tight sm:text-5xl">Games worth claiming</h1>
      <p class="text-muted-foreground text-lg">
        Current giveaways from Epic Games, Prime Gaming, GOG, and Steam, gathered in one place.
      </p>
    </div>
  </section>

  <GiveawayFilters
    counts={storeCounts}
    selectedStore={filters.store}
    endingSoon={filters.sort === "ending-soon"}
    onStoreChange={updateSelectedStore}
    onEndingSoonChange={updateEndingSoon}
  />

  {#if data.items.errors.length > 0}
    <Alert.Root>
      <HugeiconsIcon icon={AlertCircleIcon} />
      <Alert.Title>Some stores could not be refreshed</Alert.Title>
      <Alert.Description>
        <ul class="flex list-disc flex-col gap-1 pl-4">
          {#each data.items.errors as item (item.store)}
            <li><strong>{formatStore(item.store)}:</strong> {item.error}</li>
          {/each}
        </ul>
      </Alert.Description>
    </Alert.Root>
  {/if}

  {#if visibleGiveaways.length > 0}
    <section aria-labelledby="giveaway-list-title">
      <h2 id="giveaway-list-title" class="sr-only">Available giveaways</h2>
      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {#each visibleGiveaways as giveaway (`${giveaway.store}:${giveaway.id}`)}
          <ScrollReveal enabled={heroReady}>
            <GiveawayCard {giveaway} {now} />
          </ScrollReveal>
        {/each}
      </div>
    </section>
  {:else}
    <Empty.Root class="border border-dashed py-16">
      <Empty.Header>
        <Empty.Media variant="icon">
          <HugeiconsIcon icon={GiftIcon} />
        </Empty.Media>
        {#if filters.store === "all"}
          <Empty.Title>No giveaways available</Empty.Title>
          <Empty.Description>There are no active free-to-keep games right now. Check back soon.</Empty.Description>
        {:else}
          <Empty.Title>No {formatStore(filters.store)} giveaways available</Empty.Title>
          <Empty.Description>
            There are no active free-to-keep games from {formatStore(filters.store)} right now. Try another store or check
            back soon.
          </Empty.Description>
        {/if}
      </Empty.Header>
    </Empty.Root>
  {/if}
</main>
