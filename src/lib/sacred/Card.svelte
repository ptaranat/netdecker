<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	title?: string;
	mode?: "left" | "center" | "right";
	children: Snippet;
}

let { title, mode = "center", children }: Props = $props();
</script>

<article class="card">
  <header class="action">
    {#if mode === 'left'}
      <div class="left-corner"></div>
    {:else}
      <div class="left"></div>
    {/if}
    {#if title}
      <h2 class="title">{title}</h2>
    {/if}
    {#if mode === 'right'}
      <div class="right-corner"></div>
    {:else}
      <div class="right"></div>
    {/if}
  </header>
  <section class="content">
    {@render children()}
  </section>
</article>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0;
  }

  .content {
    box-shadow:
      inset 2px 0 0 0 var(--theme-text),
      inset -2px 0 0 0 var(--theme-text),
      inset 0 -2px 0 0 var(--theme-text);
    display: block;
    padding: 0.5lh 2ch 1lh 2ch;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .content::-webkit-scrollbar {
    display: none;
  }

  .action {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }

  .left {
    min-width: 10%;
    width: 100%;
    box-shadow:
      inset 2px 0 0 0 var(--theme-text),
      inset 0 2px 0 0 var(--theme-text);
    padding: calc((var(--font-size) * 0.5) * var(--theme-line-height-base)) 2ch 0 1ch;
  }

  .left-corner {
    flex-shrink: 0;
    box-shadow:
      inset 2px 0 0 0 var(--theme-text),
      inset 0 2px 0 0 var(--theme-text);
    padding: calc((var(--font-size) * 0.5) * var(--theme-line-height-base)) 1ch 0 1ch;
  }

  .right {
    min-width: 10%;
    width: 100%;
    box-shadow:
      inset -2px 0 0 0 var(--theme-text),
      inset 0 2px 0 0 var(--theme-text);
    padding: calc((var(--font-size) * 0.5) * var(--theme-line-height-base)) 2ch 0 1ch;
  }

  .right-corner {
    flex-shrink: 0;
    box-shadow:
      inset -2px 0 0 0 var(--theme-text),
      inset 0 2px 0 0 var(--theme-text);
    padding: calc((var(--font-size) * 0.5) * var(--theme-line-height-base)) 1ch 0 1ch;
  }

  .title {
    flex-shrink: 0;
    padding: 0 1ch;
    font-size: var(--font-size);
    font-weight: 400;
  }
</style>
