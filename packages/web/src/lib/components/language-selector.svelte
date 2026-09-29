<script lang="ts">
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { m } from "$lib/paraglide/messages";
  import { getLocale, isLocale, setLocale } from "$lib/paraglide/runtime";

  function selectLanguage(value: string): void {
    if (isLocale(value) && value !== getLocale()) setLocale(value);
  }
</script>

<ToggleGroup.Root
  type="single"
  variant="outline"
  bind:value={getLocale, selectLanguage}
  aria-label={m.language_label()}
>
  <ToggleGroup.Item value="en" aria-label="English" title="English" lang="en">EN</ToggleGroup.Item>
  <ToggleGroup.Item value="fr" aria-label="Français" title="Français" lang="fr">FR</ToggleGroup.Item>
</ToggleGroup.Root>
