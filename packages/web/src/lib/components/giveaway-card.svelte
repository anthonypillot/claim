<script lang="ts">
  import StoreLogo from "$lib/components/store-logo.svelte";
  import { badgeVariants } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { formatExpiry, formatStore, formatTimeLeft, getGiveawayImage, type Giveaway } from "$lib/giveaways/model";
  import { cn } from "$lib/utils";
  import { ArrowUpRight01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/svelte";

  let { giveaway, now }: { giveaway: Giveaway; now: number } = $props();

  const image = $derived(getGiveawayImage(giveaway.images));
  const expiry = $derived(formatExpiry(giveaway.freeUntil));
  const timeLeft = $derived(formatTimeLeft(giveaway.freeUntil, now));
  const expiryLabel = $derived(expiry === "Unknown" ? timeLeft : `${timeLeft}; ends ${expiry} UTC`);
  const expiryTooltip = $derived(expiry === "Unknown" ? "End date unknown" : `Ends ${expiry} UTC`);

  function trackGiveawayClick() {
    window.plausible?.("Giveaway Click", {
      props: {
        giveaway_title: giveaway.title,
        store: giveaway.store,
      },
    });
  }
</script>

<Card.Root class="h-full">
  {#if image}
    <img src={image} alt="Artwork for {giveaway.title}" class="aspect-video w-full object-cover" loading="lazy" />
  {:else}
    <div class="bg-muted text-muted-foreground flex aspect-video items-center justify-center">Artwork unavailable</div>
  {/if}

  <Card.Header>
    <Card.Action>
      <Tooltip.Root>
        <Tooltip.Trigger
          type="button"
          class={cn(badgeVariants({ variant: "outline" }), "size-7 cursor-help p-1")}
          aria-label={`Store: ${formatStore(giveaway.store)}`}
        >
          <StoreLogo store={giveaway.store} class="size-5" />
        </Tooltip.Trigger>
        <Tooltip.Content role="tooltip" sideOffset={6}>{formatStore(giveaway.store)}</Tooltip.Content>
      </Tooltip.Root>
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
        <dd class="text-muted-foreground text-right"><s class="line-through">{giveaway.price.formatted}</s></dd>
      {/if}

      <dt class="text-muted-foreground">Free until</dt>
      <dd class="text-right">
        <Tooltip.Root>
          <Tooltip.Trigger
            type="button"
            class={cn(badgeVariants({ variant: "outline" }), "cursor-help")}
            aria-label={expiryLabel}
          >
            <HugeiconsIcon icon={Clock01Icon} data-icon="inline-start" />
            {timeLeft}
          </Tooltip.Trigger>
          <Tooltip.Content role="tooltip" sideOffset={6}>{expiryTooltip}</Tooltip.Content>
        </Tooltip.Root>
      </dd>
    </dl>
  </Card.Content>

  <Card.Footer>
    <Button
      href={giveaway.url ?? undefined}
      disabled={!giveaway.url}
      target="_blank"
      rel="noreferrer"
      class="w-full"
      onclick={trackGiveawayClick}
    >
      {giveaway.url ? "View giveaway" : "Store link unavailable"}
      {#if giveaway.url}
        <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" />
      {/if}
    </Button>
  </Card.Footer>
</Card.Root>
