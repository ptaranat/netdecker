<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children: Snippet;
	style?: string;
}

let { children, style }: Props = $props();
</script>

<span class="badge" {style}>
  {@render children()}
</span>

<style>
  .badge {
    display: inline-block;
    vertical-align: top;
    text-align: center;
    font-weight: 400;
    margin: 0;
    outline: 0;
    border: 0;
    font-family: var(--font-family-mono);
    min-height: calc(var(--theme-line-height-base) * var(--font-size));
    text-transform: uppercase;
    background: var(--theme-button-background, #3a3a3a);
    padding: 0 1ch;
  }
</style>
