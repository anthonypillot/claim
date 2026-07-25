<script lang="ts">
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<h1 class="text-xl font-bold">Giveaways</h1>
<ul>
  {#each data.items.giveaways as item}
    <li>{item.title}</li>
  {/each}
</ul>
