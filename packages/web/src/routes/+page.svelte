<script lang="ts">
  import { AlertCircleIcon, GiftIcon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import BrandLogo from "$lib/components/brand-logo.svelte";
  import GiveawayCard from "$lib/components/giveaway-card.svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import * as Empty from "$lib/components/ui/empty";
  import { formatStore } from "$lib/giveaways/model";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Giveaways | Claim</title>
  <meta name="description" content="Discover free-to-keep games available now across major storefronts." />
</svelte:head>

<main class="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-7xl flex-col gap-10 px-5 py-10 sm:px-8 lg:py-14">
  <section
    aria-labelledby="page-title"
    class="flex w-full flex-col items-start gap-5 border-b pb-8 sm:flex-row sm:items-end sm:justify-between"
  >
    <div class="flex max-w-2xl flex-col items-start gap-3">
      <BrandLogo kind="lockup" alt="Claim" class="mb-3 h-auto w-64 sm:w-80" />
      <p class="text-primary text-sm font-medium tracking-widest uppercase">Free to keep</p>
      <h1 id="page-title" class="font-heading text-4xl font-bold tracking-tight sm:text-5xl">Games worth claiming</h1>
      <p class="text-muted-foreground text-lg">
        Current giveaways from Epic Games, Prime Gaming, GOG, and Steam, gathered in one place.
      </p>
    </div>
    <Badge variant="secondary">
      {data.items.count}
      {data.items.count === 1 ? "giveaway" : "giveaways"}
    </Badge>
  </section>

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

  {#if data.items.giveaways.length > 0}
    <section aria-labelledby="giveaway-list-title">
      <h2 id="giveaway-list-title" class="sr-only">Available giveaways</h2>
      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {#each data.items.giveaways as giveaway (`${giveaway.store}:${giveaway.id}`)}
          <GiveawayCard {giveaway} />
        {/each}
      </div>
    </section>
  {:else}
    <Empty.Root class="border border-dashed py-16">
      <Empty.Header>
        <Empty.Media variant="icon">
          <HugeiconsIcon icon={GiftIcon} />
        </Empty.Media>
        <Empty.Title>No giveaways available</Empty.Title>
        <Empty.Description>There are no active free-to-keep games right now. Check back soon.</Empty.Description>
      </Empty.Header>
    </Empty.Root>
  {/if}
</main>
