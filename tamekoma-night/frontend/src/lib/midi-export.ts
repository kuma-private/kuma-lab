// midi-export.ts
// Multi-track MIDI export using @tonejs/midi.

import { Midi } from '@tonejs/midi';
import type { MidiNote } from './types/song';

interface ExportTrack {
  name: string;
  instrument: string;
  notes: MidiNote[];
}

export function songToMidi(
  tracks: ExportTrack[],
  bpm: number,
  timeSignature: { beats: number; beatValue: number },
): Midi {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [timeSignature.beats, timeSignature.beatValue],
  });

  let channel = 0;
  for (const t of tracks) {
    const ch = t.instrument === 'drums' ? 9 : channel++;
    if (ch !== 9 && channel === 9) channel++; // skip drum channel for non-drum tracks
    const track = midi.addTrack();
    track.name = t.name;
    track.channel = ch;
    for (const note of t.notes) {
      track.addNote({
        midi: note.midi,
        ticks: note.startTick,
        durationTicks: note.durationTicks,
        velocity: note.velocity / 127,
      });
    }
  }
  return midi;
}

export function downloadMidi(midi: Midi, filename: string): void {
  const bytes = midi.toArray();
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.mid') ? filename : `${filename}.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
