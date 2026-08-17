<script lang="ts">
  import { page } from "$app/state";
  import { site } from "$lib/config";

  const { children } = $props();

  // site.domain is metadata for the canonical link, not routing. Empty means
  // derive it from the request, which is what a workers.dev deploy wants.
  const canonical = $derived(
    site.domain ? `https://${site.domain}${page.url.pathname}` : page.url.href,
  );
</script>

<svelte:head>
  <title>{site.title}</title>
  <meta name="description" content={site.description} />
  <link rel="canonical" href={canonical} />
</svelte:head>

<main>
  {@render children()}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #e8f5e9;
    color: #1a1a1a;
    font-family: system-ui, sans-serif;
    line-height: 1.5;
  }

  main {
    margin: 0 auto;
    max-width: 52rem;
    padding: 2rem 1rem 4rem;
  }

  :global(h1) {
    margin-bottom: 0.25rem;
  }

  :global(input, textarea) {
    box-sizing: border-box;
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font: inherit;
  }

  :global(button) {
    padding: 0.5rem 1rem;
    border: 1px solid #2b2b2b;
    border-radius: 4px;
    background: #2b2b2b;
    color: #fff;
    font: inherit;
    cursor: pointer;
  }

  :global(.error) {
    color: #b00020;
  }

  :global(.notice) {
    padding: 0.75rem;
    border: 1px solid #e0c000;
    border-radius: 4px;
    background: #fffbe6;
  }
</style>
