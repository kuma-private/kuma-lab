<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let canvas: HTMLCanvasElement;
  let animationId: number;

  const keywords = [
    'null', 'void', 'public', 'static', 'class', 'extends',
    'implements', 'throws', 'catch', 'finally', 'synchronized',
    'volatile', 'abstract', 'interface', 'package', 'import',
    'NullPointerException', 'getter', 'setter', 'bean',
    'AbstractSingletonProxyFactoryBean', 'GOTO', 'instanceof'
  ];

  onMount(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];
    const fontSize = 14;

    function resize() {
      width = canvas.parentElement?.clientWidth ?? window.innerWidth;
      height = canvas.parentElement?.clientHeight ?? window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      columns = Math.floor(width / fontSize);
      // Preserve existing drops, extend or shrink
      const newDrops = new Array(columns).fill(0);
      for (let i = 0; i < Math.min(drops.length, columns); i++) {
        newDrops[i] = drops[i];
      }
      // Randomize new columns
      for (let i = drops.length; i < columns; i++) {
        newDrops[i] = Math.random() * -100;
      }
      drops = newDrops;
    }

    resize();
    window.addEventListener('resize', resize);

    function draw() {
      if (!ctx) return;
      ctx.fillStyle = 'rgba(5, 5, 8, 0.08)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;

      for (let i = 0; i < columns; i++) {
        const keyword = keywords[Math.floor(Math.random() * keywords.length)];
        const char = keyword[Math.floor(Math.random() * keyword.length)];

        // Alternate between green and red tints
        const isRed = Math.random() > 0.6;
        if (isRed) {
          const brightness = 80 + Math.random() * 100;
          ctx.fillStyle = `rgba(${brightness}, ${brightness * 0.3}, ${brightness * 0.2}, 0.9)`;
        } else {
          const brightness = 50 + Math.random() * 80;
          ctx.fillStyle = `rgba(${brightness * 0.3}, ${brightness}, ${brightness * 0.3}, 0.8)`;
        }

        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillText(char, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      animationId = requestAnimationFrame(draw);
    }

    animationId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
    };
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  });
</script>

<canvas bind:this={canvas} class="code-rain"></canvas>

<style>
  .code-rain {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0.4;
  }
</style>
