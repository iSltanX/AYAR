<script lang="ts">
  // Project switcher (Figma 101:987, C-02): the top of the sidebar. 224 wide, padding 8, gap 8, radius/control:
  // folder icon, the project name (title/sub), chevrons-up-down (text/secondary). On hover the path appears
  // under the name (body/small, text/secondary) on one line: isolated left to right, each segment in its own
  // <bdi> (D-DES3-04), the middle collapsed. It opens the native project menu (onclick).
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { pathSegments } from '../lib/shell.ts';
  import Icon from './Icon.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style' | 'children'> {
    name: string;
    /** The project folder, shown on hover ("~/…"). */
    path?: string;
  }
  let { name, path, type = 'button', ...rest }: Props = $props();
  const uid = $props.id();
  const segments = $derived(path ? pathSegments(path) : []);
</script>

<button class="project-switcher" {type} aria-haspopup="menu" aria-describedby={path ? `${uid}-path` : undefined} {...rest}>
  <Icon name="folder" size={16} />
  <span class="text">
    <span class="project">{name}</span>
    {#if path}
      <span class="path-line" id="{uid}-path"
        ><span class="path" dir="ltr"
          >{#each segments as segment, i (i)}{#if i > 0}/{/if}<bdi>{segment}</bdi>{/each}</span
        ></span
      >
    {/if}
  </span>
  <span class="chevrons"><Icon name="chevrons-up-down" size={16} /></span>
</button>

<style>
  .project-switcher {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-8);
    inline-size: 224px;
    max-inline-size: 100%;
    padding: var(--space-8);
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-primary);
    text-align: start;
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }
  .project,
  .path-line {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project {
    font: var(--type-title-sub);
  }
  .path-line {
    display: none;
    color: var(--text-secondary);
    font: var(--type-body-small);
  }
  .path {
    unicode-bidi: isolate;
  }
  .chevrons {
    display: inline-flex;
    color: var(--text-secondary);
  }
  .project-switcher:hover {
    background: var(--bg-sunken);
  }
  .project-switcher:hover .path-line {
    display: block;
  }
  .project-switcher:active {
    background: var(--border-subtle);
  }
</style>
