<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { m } from "$lib/paraglide/messages";
  import type { DiscordPublicInformation } from "$lib/server/discord";

  let { information, section = "help" }: {
    information: DiscordPublicInformation;
    section?: "help" | "privacy" | "support";
  } = $props();
  const title = $derived(
    section === "privacy"
      ? m.discord_privacy_title()
      : section === "support"
        ? m.discord_support_title()
        : m.discord_title(),
  );
</script>

<svelte:head>
  <title>{title} | Claim</title>
  <meta name="description" content={m.discord_description()} />
</svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
  <h1 class="font-heading text-3xl font-bold">{title}</h1>
  <nav aria-label={m.discord_navigation()} class="flex flex-wrap gap-2">
    <Button href="/discord" variant="outline" data-sveltekit-reload>{m.discord_help()}</Button>
    <Button href="/discord/privacy" variant="outline" data-sveltekit-reload>{m.discord_privacy()}</Button>
    <Button href="/discord/support" variant="outline" data-sveltekit-reload>{m.discord_support()}</Button>
  </nav>
  {#if section === "help"}
    <Card.Root>
      <Card.Header>
        <Card.Title>{m.discord_install_title()}</Card.Title>
        <Card.Description>{m.discord_description()}</Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-4">
        <p>{m.discord_permissions()}</p>
        <dl class="flex flex-col gap-3">
          <div>
            <dt class="font-mono">/claim setup</dt>
            <dd>{m.discord_setup()}</dd>
          </div>
          <div>
            <dt class="font-mono">/claim status</dt>
            <dd>{m.discord_status()}</dd>
          </div>
          <div>
            <dt class="font-mono">/claim stop</dt>
            <dd>{m.discord_stop()}</dd>
          </div>
        </dl>
        <p>{m.discord_preferences()}</p>
        <p>{m.discord_baseline()}</p>
        <p>{m.discord_reliability()}</p>
      </Card.Content>
      <Card.Footer>
        {#if information.installUrl}
          <Button href={information.installUrl} rel="noreferrer">{m.discord_install()}</Button>
        {:else}
          <p>{m.discord_unavailable()}</p>
        {/if}
      </Card.Footer>
    </Card.Root>
  {:else if section === "privacy"}
    <Card.Root>
      <Card.Header>
        <Card.Title>{m.discord_data_title()}</Card.Title>
        <Card.Description>{m.discord_data_purpose()}</Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-4">
        <p>{m.discord_data_stored()}</p>
        <p>{m.discord_data_transient()}</p>
        <p>{m.discord_retention()}</p>
        <p>{m.discord_deletion()}</p>
        <p>{m.discord_removal()}</p>
        <p>{m.discord_data_access()}</p>
        <p>{m.discord_privacy_scope()}</p>
      </Card.Content>
      <Card.Footer>
        <Button href="/discord/support" variant="outline" data-sveltekit-reload>{m.discord_support()}</Button>
      </Card.Footer>
    </Card.Root>
  {:else}
    <Card.Root>
      <Card.Header>
        <Card.Title>{m.discord_requests_title()}</Card.Title>
        <Card.Description>{m.discord_requests_description()}</Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-4">
        <p>{m.discord_verification()}</p>
        <p>{m.discord_support_stop()}</p>
      </Card.Content>
      <Card.Footer>
        {#if information.supportUrl}
          <Button href={information.supportUrl} rel="noreferrer">{m.discord_contact()}</Button>
        {:else}
          <p>{m.discord_unavailable()}</p>
        {/if}
      </Card.Footer>
    </Card.Root>
  {/if}
</main>
