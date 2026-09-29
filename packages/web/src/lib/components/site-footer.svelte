<script lang="ts">
  import { m } from "$lib/paraglide/messages";

  let { apiUrl, version }: { apiUrl: string; version: string } = $props();

  const authorUrl = "https://anthonypillot.com";
  const repositoryUrl = "https://github.com/anthonypillot/claim";
  const isRelease = $derived(/^\d+\.\d+\.\d+$/.test(version));
  const versionLabel = $derived(isRelease ? `v${version}` : version);
  const versionUrl = $derived(isRelease ? `${repositoryUrl}/releases/tag/${versionLabel}` : repositoryUrl);
</script>

<footer class="border-t">
  <div
    class="text-muted-foreground mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8"
  >
    <p>
      {m.footer_credit()}
      <a
        href={authorUrl}
        target="_blank"
        rel="noreferrer"
        class="text-foreground focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >Anthony Pillot</a
      >.
    </p>
    <nav aria-label={m.footer_navigation()}>
      <ul class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <li>
          <a
            href={apiUrl}
            target="_blank"
            rel="noreferrer"
            class="text-foreground focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >API</a
          >
        </li>
        <li>
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
            class="text-foreground focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >GitHub</a
          >
        </li>
        <li>
          <a
            href={versionUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={m.footer_version({ version: versionLabel })}
            class="text-foreground focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >{versionLabel}</a
          >
        </li>
      </ul>
    </nav>
  </div>
</footer>
