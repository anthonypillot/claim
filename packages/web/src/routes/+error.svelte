<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  import * as Empty from "$lib/components/ui/empty";
  import { AlertCircleIcon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/svelte";

  let { status = page.status, retry = reloadPage }: { status?: number; retry?: () => void } = $props();

  const retryable = $derived(status >= 500);
  const title = $derived(status === 404 ? "Page not found" : "Something went wrong");
  const description = $derived(
    status === 404
      ? "The page you are looking for does not exist or may have moved."
      : "Claim could not load this page. Please try again.",
  );

  function reloadPage(): void {
    window.location.reload();
  }
</script>

<svelte:head>
  <title>{title} | Claim</title>
</svelte:head>

<main class="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center px-5 py-10 sm:px-8 lg:py-14">
  <Empty.Root class="border border-dashed py-16">
    <Empty.Header>
      <Empty.Media variant="icon">
        <HugeiconsIcon icon={AlertCircleIcon} />
      </Empty.Media>
      <p class="text-muted-foreground text-sm font-medium">Error {status}</p>
      <Empty.Title role="heading" aria-level={1}>{title}</Empty.Title>
      <Empty.Description>{description}</Empty.Description>
    </Empty.Header>
    <Empty.Content>
      {#if retryable}
        <Button onclick={retry}>Try again</Button>
      {:else}
        <Button href="/">Return home</Button>
      {/if}
    </Empty.Content>
  </Empty.Root>
</main>
