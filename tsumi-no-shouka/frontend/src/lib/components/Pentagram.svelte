<script lang="ts">
  let { size = 200, speed = 8 }: { size?: number; speed?: number } = $props();

  const cx = 50;
  const cy = 50;
  const r = 45;

  // Calculate 5 points of a pentagram
  function getPoints(): string {
    const points: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    // Draw star: 0→2→4→1→3→0
    const order = [0, 2, 4, 1, 3];
    return order.map((idx) => points[idx].join(',')).join(' ');
  }
</script>

<div class="pentagram-container" style="width:{size}px;height:{size}px">
  <svg viewBox="0 0 100 100" class="pentagram" style="animation-duration: {speed}s">
    <defs>
      <filter id="pentaGlow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle {cx} {cy} {r} class="outer-circle" />
    <polygon points={getPoints()} class="star" />
    <circle {cx} {cy} r="20" class="inner-circle" />
  </svg>
</div>

<style>
  .pentagram-container {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pentagram {
    width: 100%;
    height: 100%;
    animation: pentagram 8s linear infinite;
    filter: url(#pentaGlow);
  }

  .outer-circle {
    fill: none;
    stroke: #cc0000;
    stroke-width: 1.5;
    opacity: 0.7;
  }

  .star {
    fill: none;
    stroke: #ff2200;
    stroke-width: 1.8;
    stroke-linejoin: round;
  }

  .inner-circle {
    fill: none;
    stroke: #880000;
    stroke-width: 0.8;
    opacity: 0.5;
    stroke-dasharray: 4 2;
  }
</style>
