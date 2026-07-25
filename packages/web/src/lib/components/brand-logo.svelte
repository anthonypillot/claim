<script lang="ts">
  import { cn } from "$lib/utils";

  type Props = {
    kind?: "mark" | "lockup";
    alt?: string;
    class?: string;
  };

  let { kind = "lockup", alt = "Claim", class: className }: Props = $props();

  let source = $derived(kind === "mark" ? "/favicon.svg" : "/logo.svg");
  let whiteSource = $derived(kind === "mark" ? "/favicon-white.svg" : "/logo-white.svg");
</script>

<img src={source} {alt} class={cn("dark:hidden", className)} />
<img src={whiteSource} {alt} class={cn("hidden dark:block", className)} />
