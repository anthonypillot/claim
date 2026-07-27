import "../../../routes/layout.css";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import UiRegressionTestWrapper from "./ui-regression-test-wrapper.svelte";

test("uses Bits UI orientation attributes for toggle group styles", async () => {
	const screen = render(UiRegressionTestWrapper, { orientation: "vertical" });
	const group = screen.getByTestId("toggle-group");

	await expect.element(group).toHaveAttribute("data-orientation", "vertical");
	expect(getComputedStyle(group.element()).flexDirection).toBe("column");

	const firstItem = group.element().querySelector('[data-slot="toggle-group-item"]');
	expect(firstItem?.className).toContain("group-data-[orientation=vertical]/toggle-group");
});

test("uses Bits UI state attributes for tooltip animations", async () => {
	const screen = render(UiRegressionTestWrapper, { tooltipOpen: true });
	const tooltip = screen.getByTestId("tooltip-content");

	await expect.element(tooltip).toBeInTheDocument();
	await expect.element(tooltip).toHaveAttribute("data-state", "instant-open");
	expect(tooltip.element().className).toContain("data-[state=instant-open]:animate-in");
	expect(tooltip.element().className).toContain("data-[state=closed]:animate-out");
});
