<script lang="ts">
  import { page } from "$app/state";
  import { ModeWatcher } from "mode-watcher";
  import { onMount } from "svelte";
  import SiteFooter from "$lib/components/site-footer.svelte";
  import SiteHeader from "$lib/components/site-header.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { getApiUrl, getPlausibleAnalytics, getWebUrl } from "$lib/config";
  import "./layout.css";

  let { children } = $props();
  let isDark = $state(false);

  let favicon = $derived(isDark ? "/favicon-white.svg" : "/favicon.svg");
  let canonicalUrl = $derived(getWebUrl(page.url.pathname, page.url.origin));
  const apiUrl = getApiUrl("/openapi");
  const plausibleAnalytics = getPlausibleAnalytics();

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
  <link rel="canonical" href={canonicalUrl} />
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
  <link rel="icon" type="image/svg+xml" href={favicon} />
  <link rel="apple-touch-icon" href="/brand/favicon-180.png" />
  {#if plausibleAnalytics}
    <script
      defer
      data-domain={plausibleAnalytics.domain}
      src={plausibleAnalytics.scriptUrl}
    ></script>
  {/if}
</svelte:head>
<ModeWatcher />
<Tooltip.Provider>
  <div class="flex min-h-svh flex-col">
    <SiteHeader />
    <div class="flex-1">
      {@render children()}
    </div>
    <SiteFooter {apiUrl} version={__APP_VERSION__} />
  </div>
</Tooltip.Provider>
