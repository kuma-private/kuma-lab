<script lang="ts">
  const particles = Array.from({ length: 20 }, (_, i) => ({
    left: Math.random() * 90 + 5,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 4 + 3,
    delay: Math.random() * 5,
    color: Math.random() > 0.3 ? '#c9b87a' : '#fff'
  }));
</script>

<div class="particles">
  {#each particles as p}
    <span
      class="particle"
      style="
        left: {p.left}%;
        width: {p.size}px;
        height: {p.size}px;
        background: {p.color};
        animation-duration: {p.duration}s;
        animation-delay: {p.delay}s;
      "
    ></span>
  {/each}
</div>

<style>
  .particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
  }
  .particle {
    position: absolute;
    bottom: 0;
    border-radius: 50%;
    animation: celebrationFloat linear infinite;
    box-shadow: 0 0 6px currentColor;
  }
</style>
