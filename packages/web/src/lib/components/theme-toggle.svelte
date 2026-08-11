<script lang="ts">
  import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { mode, setMode } from "mode-watcher";
  import { Switch } from "$lib/components/ui/switch";

  let label = $derived(mode.current === "dark" ? "Switch to light mode" : "Switch to dark mode");
</script>

<div class="text-foreground flex items-center gap-2">
  <HugeiconsIcon icon={Sun03Icon} size={16} aria-hidden="true" />
  <Switch
    size="lg"
    checked={mode.current === "dark"}
    onCheckedChange={(checked) => setMode(checked ? "dark" : "light")}
    aria-label={label}
    title={label}
  />
  <HugeiconsIcon icon={Moon02Icon} size={16} aria-hidden="true" />
</div>
