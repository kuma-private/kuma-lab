import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/**
 * Demon appear: blur → clear + scale up from the abyss
 */
export function demonAppear(
  node: Element,
  params: { duration?: number; delay?: number } = {}
): TransitionConfig {
  const { duration = 800, delay = 0 } = params;
  return {
    delay,
    duration,
    easing: cubicOut,
    css: (t: number) => {
      const blur = (1 - t) * 12;
      const scale = 0.7 + t * 0.3;
      const opacity = t;
      return `
        opacity: ${opacity};
        filter: blur(${blur}px) brightness(${0.5 + t * 0.5});
        transform: scale(${scale});
      `;
    }
  };
}

/**
 * Vanish: slide right + blur + fade into oblivion
 */
export function sinVanish(
  node: Element,
  params: { duration?: number; delay?: number } = {}
): TransitionConfig {
  const { duration = 600, delay = 0 } = params;
  return {
    delay,
    duration,
    easing: cubicOut,
    css: (t: number) => {
      const x = (1 - t) * 120;
      const blur = (1 - t) * 8;
      const opacity = t;
      return `
        opacity: ${opacity};
        filter: blur(${blur}px);
        transform: translateX(${x}px);
      `;
    }
  };
}

/**
 * Divine descend: drop from above with heavenly glow
 */
export function divineDescend(
  node: Element,
  params: { duration?: number; delay?: number } = {}
): TransitionConfig {
  const { duration = 700, delay = 0 } = params;
  return {
    delay,
    duration,
    easing: cubicOut,
    css: (t: number) => {
      const y = (1 - t) * -40;
      const opacity = t;
      const glow = (1 - t) * 20;
      return `
        opacity: ${opacity};
        transform: translateY(${y}px);
        text-shadow: 0 0 ${glow}px rgba(201, 184, 122, 0.8);
      `;
    }
  };
}
