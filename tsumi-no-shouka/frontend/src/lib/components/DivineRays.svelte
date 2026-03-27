<script lang="ts">
  let { intensity = 'normal' }: { intensity?: 'subtle' | 'normal' | 'triumphant' } = $props();

  const opacityMap = {
    subtle: { gold: 0.08, white: 0.05 },
    normal: { gold: 0.15, white: 0.10 },
    triumphant: { gold: 0.25, white: 0.18 }
  };

  let o = $derived(opacityMap[intensity]);
</script>

<div class="divine-rays" class:triumphant={intensity === 'triumphant'}>
  <div class="rays-inner rays-layer-1" style="
    --gold-o: {o.gold};
    --white-o: {o.white};
  "></div>
  <div class="rays-inner rays-layer-2" style="
    --gold-o: {o.gold * 0.7};
    --white-o: {o.white * 0.7};
  "></div>
</div>

<style>
  .divine-rays {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
    animation: raysBreathing 4s ease-in-out infinite;
  }

  .divine-rays.triumphant {
    animation: raysBreathing 3s ease-in-out infinite;
  }

  .rays-inner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 200%;
    height: 200%;
    transform: translate(-50%, -50%);
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  }

  .rays-layer-1 {
    background: conic-gradient(
      from 0deg at 50% 50%,
      transparent 0deg,
      rgba(201, 184, 122, var(--gold-o)) 10deg,
      transparent 20deg,
      transparent 30deg,
      rgba(255, 255, 255, var(--white-o)) 40deg,
      transparent 50deg,
      transparent 60deg,
      rgba(201, 184, 122, var(--gold-o)) 70deg,
      transparent 80deg,
      transparent 90deg,
      rgba(255, 255, 255, var(--white-o)) 100deg,
      transparent 110deg,
      transparent 120deg,
      rgba(201, 184, 122, var(--gold-o)) 130deg,
      transparent 140deg,
      transparent 150deg,
      rgba(255, 255, 255, var(--white-o)) 160deg,
      transparent 170deg,
      transparent 180deg,
      rgba(201, 184, 122, var(--gold-o)) 190deg,
      transparent 200deg,
      transparent 210deg,
      rgba(255, 255, 255, var(--white-o)) 220deg,
      transparent 230deg,
      transparent 240deg,
      rgba(201, 184, 122, var(--gold-o)) 250deg,
      transparent 260deg,
      transparent 270deg,
      rgba(255, 255, 255, var(--white-o)) 280deg,
      transparent 290deg,
      transparent 300deg,
      rgba(201, 184, 122, var(--gold-o)) 310deg,
      transparent 320deg,
      transparent 340deg,
      rgba(255, 255, 255, var(--white-o)) 350deg,
      transparent 360deg
    );
    animation: divineRays 30s linear infinite;
  }

  .rays-layer-2 {
    background: conic-gradient(
      from 45deg at 50% 50%,
      transparent 0deg,
      rgba(201, 184, 122, var(--gold-o)) 15deg,
      transparent 25deg,
      transparent 45deg,
      rgba(255, 255, 255, var(--white-o)) 55deg,
      transparent 65deg,
      transparent 85deg,
      rgba(201, 184, 122, var(--gold-o)) 95deg,
      transparent 105deg,
      transparent 125deg,
      rgba(255, 255, 255, var(--white-o)) 135deg,
      transparent 145deg,
      transparent 165deg,
      rgba(201, 184, 122, var(--gold-o)) 175deg,
      transparent 185deg,
      transparent 205deg,
      rgba(255, 255, 255, var(--white-o)) 215deg,
      transparent 225deg,
      transparent 245deg,
      rgba(201, 184, 122, var(--gold-o)) 255deg,
      transparent 265deg,
      transparent 285deg,
      rgba(255, 255, 255, var(--white-o)) 295deg,
      transparent 305deg,
      transparent 325deg,
      rgba(201, 184, 122, var(--gold-o)) 335deg,
      transparent 345deg,
      transparent 360deg
    );
    animation: divineRays 45s linear infinite reverse;
  }
</style>
