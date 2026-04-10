// soundfont-instruments.ts
// SoundFont instrument loader using soundfont-player library.
// Loads realistic GM SoundFont samples from midi-js-soundfonts CDN.
// Provides a play API compatible with MultiTrackPlayer's scheduling flow.

import type { Player } from 'soundfont-player';

export type { Player } from 'soundfont-player';

const SOUNDFONT_URL = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/';

// Map our instrument names to soundfont-player GM instrument names.
// Piano uses the Salamander sampler (already high quality), drums use basic synth.
const GM_INSTRUMENT_MAP: Record<string, string> = {
  organ: 'drawbar_organ',
  strings: 'string_ensemble_1',
  bass: 'electric_bass_finger',
  guitar: 'acoustic_guitar_steel',
};

/**
 * Load a SoundFont instrument for the given instrument name.
 * Returns null for instruments that should not use SoundFont (piano, drums, unknown).
 *
 * @param destination - AudioNode to route output to (e.g. a Tone.js Volume node's
 *   underlying GainNode). Each call creates a fresh player wired to this destination,
 *   so different tracks can have independent volume/mute controls.
 *   The CDN samples are browser-cached after the first fetch.
 */
export async function loadSoundFontInstrument(
  instrumentName: string,
  audioContext: AudioContext,
  destination: AudioNode,
): Promise<Player | null> {
  const sfName = GM_INSTRUMENT_MAP[instrumentName];
  if (!sfName) return null;

  try {
    const Soundfont = await import('soundfont-player');
    const player = await Soundfont.instrument(audioContext, sfName as any, {
      soundfont: 'MusyngKite',
      from: SOUNDFONT_URL,
      destination,
    });
    return player;
  } catch (e) {
    console.warn(`Failed to load SoundFont for ${instrumentName} (${sfName}):`, e);
    return null;
  }
}

/**
 * Check if a given instrument name has a SoundFont mapping.
 */
export function hasSoundFontMapping(instrumentName: string): boolean {
  return instrumentName in GM_INSTRUMENT_MAP;
}
