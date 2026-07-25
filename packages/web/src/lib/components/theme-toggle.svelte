<script lang="ts">
  import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { toggleMode } from "mode-watcher";
  import { Button } from "$lib/components/ui/button";
</script>

<Button
  variant="outline"
  size="icon"
  aria-label="Toggle color theme"
  title="Toggle color theme"
  onclick={toggleMode}
>
  <span class="dark:hidden"><HugeiconsIcon icon={Sun03Icon} /></span>
  <span class="hidden dark:inline-flex"><HugeiconsIcon icon={Moon02Icon} /></span>
</Button>
