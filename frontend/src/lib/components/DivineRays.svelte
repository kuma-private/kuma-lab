<script lang="ts">
  // Pure CSS divine rays - no props needed
</script>

<div class="divine-rays">
  <div class="rays-inner"></div>
</div>

<style>
  .divine-rays {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .rays-inner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 200%;
    height: 200%;
    transform: translate(-50%, -50%);
    background: conic-gradient(
      from 0deg at 50% 50%,
      transparent 0deg,
      rgba(201, 184, 122, 0.06) 10deg,
      transparent 20deg,
      transparent 30deg,
      rgba(255, 255, 255, 0.04) 40deg,
      transparent 50deg,
      transparent 60deg,
      rgba(201, 184, 122, 0.05) 70deg,
      transparent 80deg,
      transparent 90deg,
      rgba(255, 255, 255, 0.03) 100deg,
      transparent 110deg,
      transparent 120deg,
      rgba(201, 184, 122, 0.06) 130deg,
      transparent 140deg,
      transparent 150deg,
      rgba(255, 255, 255, 0.04) 160deg,
      transparent 170deg,
      transparent 180deg,
      rgba(201, 184, 122, 0.05) 190deg,
      transparent 200deg,
      transparent 210deg,
      rgba(255, 255, 255, 0.03) 220deg,
      transparent 230deg,
      transparent 240deg,
      rgba(201, 184, 122, 0.06) 250deg,
      transparent 260deg,
      transparent 270deg,
      rgba(255, 255, 255, 0.04) 280deg,
      transparent 290deg,
      transparent 300deg,
      rgba(201, 184, 122, 0.05) 310deg,
      transparent 320deg,
      transparent 340deg,
      rgba(255, 255, 255, 0.03) 350deg,
      transparent 360deg
    );
    animation: divineRays 30s linear infinite;
    mask-image: radial-gradient(ellipse at center, black 20%, transparent 70%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 20%, transparent 70%);
  }
</style>
