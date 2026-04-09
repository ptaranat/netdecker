<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	hotkey?: string;
	href?: string;
	target?: string;
	onclick?: () => void;
	children: Snippet;
}

let { hotkey, href, target, onclick, children }: Props = $props();
</script>

{#if href}
  <a class="root" {href} {target} tabindex="0">
    {#if hotkey}<span class="hotkey">{hotkey}</span>{/if}
    <span class="label">{@render children()}</span>
  </a>
{:else}
  <button class="root" type="button" {onclick}>
    {#if hotkey}<span class="hotkey">{hotkey}</span>{/if}
    <span class="label">{@render children()}</span>
  </button>
{/if}

<style>
  .hotkey {
    background: var(--theme-button-foreground);
    color: var(--theme-text);
    cursor: pointer;
    flex-shrink: 0;
    font-weight: 400;
    padding: 0.1em 1ch;
    user-select: none;
    display: inline-flex;
    align-items: center;
  }

  .label {
    background: var(--theme-button-background);
    box-shadow: inset 0 0 0 2px var(--theme-button-foreground);
    cursor: pointer;
    flex-shrink: 0;
    font-weight: 400;
    padding: 0.1em 1ch;
    text-transform: uppercase;
    user-select: none;
    display: inline-flex;
    align-items: center;
  }

  .root {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    outline: 0;
    border: 0;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: var(--font-family-mono);
    font-size: var(--font-size);
    line-height: var(--theme-line-height-base, 1.5);
    flex-shrink: 0;
    text-decoration: none;
    color: inherit;
    background: none;
  }

  .root:hover .hotkey,
  .root:focus .hotkey,
  .root:active .hotkey {
    background: var(--theme-focused-foreground);
  }

  .root:hover .label,
  .root:focus .label,
  .root:active .label {
    background: var(--theme-focused-foreground);
    color: var(--theme-background, #000);
    box-shadow: inset 0 0 0 2px var(--theme-focused-foreground);
  }
</style>
