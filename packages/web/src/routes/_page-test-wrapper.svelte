<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip";
  import type { PageProps } from "./$types";
  import Page from "./+page.svelte";

  let props: PageProps = $props();
</script>

<Tooltip.Provider>
  <Page {...props} />
</Tooltip.Provider>
