<script lang="ts">
  import BrandLogo from "$lib/components/brand-logo.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
</script>

<header class="bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
  <div class="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
    <a
      href="/"
      aria-label="Claim home"
      class="focus-visible:ring-ring inline-flex rounded-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <BrandLogo kind="mark" alt="" class="size-8" />
    </a>
    <ThemeToggle />
  </div>
</header>
