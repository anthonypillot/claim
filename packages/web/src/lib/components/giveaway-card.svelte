<script lang="ts">
  import StoreLogo from "$lib/components/store-logo.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { formatExpiry, formatStore, getGiveawayImage, type Giveaway } from "$lib/giveaways/model";
  import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/svelte";

  let { giveaway }: { giveaway: Giveaway } = $props();

  const image = $derived(getGiveawayImage(giveaway.images));
</script>

<Card.Root class="h-full">
  {#if image}
    <img src={image} alt="Artwork for {giveaway.title}" class="aspect-video w-full object-cover" loading="lazy" />
  {:else}
    <div class="bg-muted text-muted-foreground flex aspect-video items-center justify-center">Artwork unavailable</div>
  {/if}

  <Card.Header>
    <Card.Action>
      <Badge variant="outline" class="size-7 p-1" aria-label={`Store: ${formatStore(giveaway.store)}`}>
        <StoreLogo store={giveaway.store} class="size-5" />
      </Badge>
    </Card.Action>
    <Card.Title>{giveaway.title}</Card.Title>
    <Card.Description>{giveaway.description}</Card.Description>
  </Card.Header>

  <Card.Content class="flex flex-1 flex-col gap-3">
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      <dt class="text-muted-foreground">Publisher</dt>
      <dd class="truncate text-right">{giveaway.seller}</dd>

      {#if giveaway.price}
        <dt class="text-muted-foreground">Original price</dt>
        <dd class="text-right">{giveaway.price.formatted}</dd>
      {/if}

      <dt class="text-muted-foreground">Free until</dt>
      <dd class="text-right">{formatExpiry(giveaway.freeUntil)} UTC</dd>
    </dl>
  </Card.Content>

  <Card.Footer>
    <Button href={giveaway.url ?? undefined} disabled={!giveaway.url} target="_blank" rel="noreferrer" class="w-full">
      {giveaway.url ? "View giveaway" : "Store link unavailable"}
      {#if giveaway.url}
        <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" />
      {/if}
    </Button>
  </Card.Footer>
</Card.Root>
