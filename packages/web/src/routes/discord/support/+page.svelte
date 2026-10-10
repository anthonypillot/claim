<script lang="ts">
  import DiscordInformation from "$lib/components/discord-information.svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<DiscordInformation information={data} section="support" />
