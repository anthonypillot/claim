<script lang="ts">
  import { ModeWatcher } from "mode-watcher";
  import { onMount } from "svelte";
  import SiteHeader from "$lib/components/site-header.svelte";
  import "./layout.css";

  let { children } = $props();
  let isDark = $state(false);

  let favicon = $derived(isDark ? "/favicon-alt-white.svg" : "/favicon-alt.svg");

  onMount(() => {
    function syncTheme() {
      isDark = document.documentElement.classList.contains("dark");
    }

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <title>Claim</title>
  <link rel="icon" type="image/svg+xml" href={favicon} />
  <link rel="apple-touch-icon" href="/brand/favicon-alt-180.png" />
</svelte:head>
<ModeWatcher />
<SiteHeader />
{@render children()}
