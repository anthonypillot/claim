<script lang="ts">
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import * as Tooltip from "$lib/components/ui/tooltip";

	type Props = {
		orientation?: "horizontal" | "vertical";
		tooltipOpen?: boolean;
	};

	let { orientation = "horizontal", tooltipOpen = false }: Props = $props();
</script>

<Tooltip.Provider>
	<ToggleGroup.Root
		type="single"
		{orientation}
		variant="outline"
		spacing={0}
		data-testid="toggle-group"
	>
		<ToggleGroup.Item value="first">First</ToggleGroup.Item>
		<ToggleGroup.Item value="second">Second</ToggleGroup.Item>
	</ToggleGroup.Root>

	<Tooltip.Root open={tooltipOpen}>
		<Tooltip.Trigger type="button">Trigger</Tooltip.Trigger>
		<Tooltip.Content data-testid="tooltip-content">Tooltip content</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
