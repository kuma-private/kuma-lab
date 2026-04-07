<script lang="ts">
  import { tick } from 'svelte';
  import { parseDirectives, type ParsedDirectives, type VelocityLevel } from '$lib/directive-parser';
  import type { DirectiveBlock, MidiNote, GeneratedMidiData, MidiControlChange } from '$lib/types/song';
  import { parseProgression, resolveRepeats } from '$lib/chord-parser';
  import { voiceChords, type VoicingConfig } from '$lib/voicing-engine';
  import { generateRhythm, type RhythmConfig } from '$lib/rhythm-engine';
  import { suggestDirectives, generateMidi } from '$lib/api';
  import { midiToNoteName } from '$lib/chord-player';
  import { showToast } from '$lib/stores/toast.svelte';
  import MiniPianoRoll from './MiniPianoRoll.svelte';
  import PianoRollEditor from './PianoRollEditor.svelte';

  interface Props {
    block: DirectiveBlock;
    trackName: string;
    instrument: string;
    sectionName: string;
    songId?: string;
    chordProgression?: string;
    bpm?: number;
    timeSignature?: string;
    onSave: (directives: string, generatedMidi?: GeneratedMidiData) => void;
    onClose: () => void;
    onPreview?: () => void;
  }

  const GENERATING_TIPS = [
    'AIがパターンを生成しています...',
    'コード進行を分析中...',
    'ボイシングを最適化中...',
    'リズムパターンを構築中...',
    'ダイナミクスを調整中...',
    '仕上げ処理中...',
  ];

  const MODE_CHIPS = ['block', 'arpUp', 'arpDown', 'bossa', 'jazz', '8beat'] as const;

  const VOICING_SNAPS = [
    { value: 0,   name: 'close' },
    { value: 25,  name: 'open' },
    { value: 50,  name: 'drop2' },
    { value: 75,  name: 'spread' },
    { value: 100, name: 'shell' },
  ] as const;

  const VELOCITY_SNAPS = [
    { value: 0,   name: 'pp' },
    { value: 20,  name: 'p' },
    { value: 40,  name: 'mp' },
    { value: 60,  name: 'mf' },
    { value: 80,  name: 'f' },
    { value: 100, name: 'ff' },
  ] as const;

  const HUMANIZE_MIN = 0;
  const HUMANIZE_MAX = 30;
  const SWING_MIN = 0;
  const SWING_MAX = 70;

  let {
    block,
    trackName,
    instrument,
    sectionName,
    songId,
    chordProgression,
    bpm = 120,
    timeSignature = '4/4',
    onSave,
    onClose,
    onPreview,
  }: Props = $props();

  // --- State ---
  let parsed = $state(parseDirectives(block.directives));
  let directives: ParsedDirectives = $state(parsed.directives);
  let rawText = $state(directivesToText(directives));
  let rawOpen = $state(false);
  let parseErrors: string[] = $state([]);
  let aiPrompt = $state('');
  let aiLoading = $state(false);
  let aiError = $state<string | null>(null);
  let generatingTip = $state(GENERATING_TIPS[0]);
  let tipInterval: ReturnType<typeof setInterval> | null = null;

  // --- AI MIDI generation state ---
  let expressionSlider = $state(block.generatedMidi?.expression ?? 50);
  let feelSlider = $state(block.generatedMidi?.feel ?? 50);
  let generatedMidiData = $state<GeneratedMidiData | undefined>(block.generatedMidi);
  let detailOpen = $state(false);
  let pianoRollOpen = $state(false);

  // --- Free mode / melody ---
  let isFreeMode = $derived(directives.mode === 'free');
  let melodyText = $state(directives.melody ? extractMelodyText(block.directives) : '');

  // --- Slider state (continuous values) ---
  let voicingSlider = $state(voicingNameToValue(directives.voicing));
  let velocitySlider = $state(velocityNameToValue(typeof directives.velocity === 'string' ? directives.velocity : 'mf'));

  // --- Derived ---
  let headerLabel = $derived.by(() => {
    const hasBars = block.startBar !== undefined && block.endBar !== undefined && block.endBar > block.startBar;
    const bars = hasBars ? ` (bars ${block.startBar + 1}–${block.endBar})` : '';
    return `${trackName}${sectionName ? ` — ${sectionName}` : ''}${bars}`;
  });

  let snappedVoicing = $derived.by(() => snapToNearest(voicingSlider, VOICING_SNAPS));
  let snappedVelocity = $derived.by(() => snapToNearest(velocitySlider, VELOCITY_SNAPS));

  // --- Snap helpers ---
  function snapToNearest(value: number, snaps: readonly { value: number; name: string }[]): { value: number; name: string } {
    let closest = snaps[0];
    let minDist = Math.abs(value - snaps[0].value);
    for (const s of snaps) {
      const dist = Math.abs(value - s.value);
      if (dist < minDist) {
        minDist = dist;
        closest = s;
      }
    }
    return closest;
  }

  function voicingNameToValue(name: string | undefined): number {
    const found = VOICING_SNAPS.find(s => s.name === name);
    return found ? found.value : 0;
  }

  function velocityNameToValue(name: string | undefined): number {
    const found = VELOCITY_SNAPS.find(s => s.name === name);
    return found ? found.value : 60;
  }

  // --- directivesToText helper ---
  function directivesToText(d: ParsedDirectives): string {
    const lines: string[] = [];
    if (d.mode) lines.push(`@mode: ${d.mode}`);
    if (d.voicing) lines.push(`@voicing: ${d.voicing}`);
    if (d.velocity) {
      if (typeof d.velocity === 'string') lines.push(`@velocity: ${d.velocity}`);
      else lines.push(`@velocity: ${d.velocity.from}→${d.velocity.to}`);
    }
    if (d.humanize !== undefined) lines.push(`@humanize: ${d.humanize}%`);
    if (d.swing !== undefined) lines.push(`@swing: ${d.swing}%`);
    if (d.strum !== undefined) lines.push(`@strum: ${d.strum}ms`);
    if (d.octave !== undefined) lines.push(`@octave: ${d.octave}`);
    if (d.range) lines.push(`@range: ${d.range.low}-${d.range.high}`);
    if (d.lead) lines.push(`@lead: ${d.lead}`);
    if (d.bass) lines.push(`@bass: ${d.bass}`);
    if (d.instrument) lines.push(`@instrument: ${d.instrument}`);
    if (d.comment) lines.push(`@comment: ${d.comment}`);
    if (d.melody && d.melody.notes.length > 0) {
      // Preserve raw melody text if available
      if (melodyText) lines.push(`@melody: ${melodyText}`);
    }
    return lines.join('\n');
  }

  // --- GUI → Raw sync ---
  function syncToRaw() {
    rawText = directivesToText(directives);
    parseErrors = [];
  }

  function setMode(value: string) {
    directives = { ...directives, mode: value };
    syncToRaw();
  }

  function setVoicingFromSlider(value: number) {
    voicingSlider = value;
    const snapped = snapToNearest(value, VOICING_SNAPS);
    directives = { ...directives, voicing: snapped.name };
    syncToRaw();
  }

  function setVelocityFromSlider(value: number) {
    velocitySlider = value;
    const snapped = snapToNearest(value, VELOCITY_SNAPS);
    directives = { ...directives, velocity: snapped.name as VelocityLevel };
    syncToRaw();
  }

  function setHumanize(value: number) {
    directives = { ...directives, humanize: value };
    syncToRaw();
  }

  function setSwing(value: number) {
    directives = { ...directives, swing: value };
    syncToRaw();
  }

  // --- Raw → GUI sync ---
  function onRawInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    rawText = target.value;
    const result = parseDirectives(rawText);
    directives = result.directives;
    parseErrors = result.errors.map(e => e.line ? `Line ${e.line}: ${e.message}` : e.message);
    // Sync slider positions from parsed directives
    voicingSlider = voicingNameToValue(directives.voicing);
    velocitySlider = velocityNameToValue(typeof directives.velocity === 'string' ? directives.velocity : 'mf');
    // Sync melody text from raw input
    melodyText = extractMelodyText(rawText);
  }

  // --- AI generate (MIDI generation) ---
  async function handleGenerate() {
    if (!songId) {
      showToast('Song ID が不明です', 'error');
      return;
    }
    if (!aiPrompt.trim()) {
      showToast('スタイルを入力してください', 'error');
      return;
    }

    aiLoading = true;
    aiError = null;

    // Start tip rotation
    let tipIndex = 0;
    generatingTip = GENERATING_TIPS[0];
    tipInterval = setInterval(() => {
      tipIndex = (tipIndex + 1) % GENERATING_TIPS.length;
      generatingTip = GENERATING_TIPS[tipIndex];
    }, 2500);

    try {
      const startBar1 = (block.startBar ?? 0) + 1;
      const endBar1 = block.endBar ?? startBar1;
      const barRange = startBar1 === endBar1
        ? `${startBar1}`
        : `${startBar1}-${endBar1}`;

      const result = await generateMidi(songId, {
        chordProgression: chordProgression ?? '',
        style: aiPrompt.trim(),
        instrument,
        bpm,
        expression: expressionSlider,
        feel: feelSlider,
        barRange,
      });

      // Map API response fields to MidiNote type
      const rawNotes = result.notes ?? [];
      const mappedNotes: MidiNote[] = (rawNotes as any[]).map((n: any) => ({
        midi: n.midi,
        startTick: n.startTick ?? n.tick ?? 0,
        durationTicks: n.durationTicks ?? n.duration ?? 480,
        velocity: n.velocity,
        channel: n.channel ?? 0,
      }));

      if (mappedNotes.length === 0) {
        aiError = 'AIがノートを生成できませんでした。スタイルやコード進行を確認してください。';
        showToast(aiError, 'error');
        return;
      }

      // Map API response CC events to MidiControlChange type
      const mappedCCs: MidiControlChange[] = (result.controlChanges ?? []).map((cc: any) => ({
        tick: cc.tick ?? cc.t ?? 0,
        cc: cc.cc,
        value: cc.value ?? cc.v ?? 0,
      }));

      // Store as GeneratedMidiData
      generatedMidiData = {
        notes: mappedNotes,
        controlChanges: mappedCCs.length > 0 ? mappedCCs : undefined,
        style: result.style,
        expression: result.expression,
        feel: result.feel,
        generatedAt: new Date().toISOString(),
      };

      // Show AI-generated notes in preview
      previewNotes = mappedNotes;

      // Explicitly draw after DOM updates to ensure canvas is mounted
      await tick();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          drawPreview(previewNotes);
        });
      });

      showToast('MIDIを生成しました', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成に失敗しました';
      aiError = message;
      showToast(message, 'error');
    } finally {
      aiLoading = false;
      if (tipInterval) {
        clearInterval(tipInterval);
        tipInterval = null;
      }
    }
  }

  // --- Actions ---
  function handleOk() {
    saveAndClose();
  }

  let previewPlaying = $state(false);
  let previewTimeouts: ReturnType<typeof setTimeout>[] = [];

  async function handlePreview() {
    if (previewPlaying) {
      // Stop
      previewTimeouts.forEach(clearTimeout);
      previewTimeouts = [];
      previewPlaying = false;
      return;
    }

    // Apply pedal processing if CC data exists
    let notes = [...previewNotes];
    if (generatedMidiData?.controlChanges?.length) {
      const pedalCCs = generatedMidiData.controlChanges.filter(cc => cc.cc === 64);
      if (pedalCCs.length > 0) {
        // Build pedal ranges
        const ranges: { start: number; end: number }[] = [];
        let pedalStart: number | null = null;
        for (const cc of pedalCCs.sort((a, b) => a.tick - b.tick)) {
          if (cc.value >= 64 && pedalStart === null) pedalStart = cc.tick;
          else if (cc.value < 64 && pedalStart !== null) {
            ranges.push({ start: pedalStart, end: cc.tick });
            pedalStart = null;
          }
        }
        if (pedalStart !== null) {
          const maxTick = Math.max(...notes.map(n => n.startTick + n.durationTicks));
          ranges.push({ start: pedalStart, end: maxTick });
        }
        // Extend notes within pedal ranges
        notes = notes.map(n => {
          const noteEnd = n.startTick + n.durationTicks;
          for (const r of ranges) {
            if (n.startTick >= r.start && noteEnd <= r.end) {
              return { ...n, durationTicks: r.end - n.startTick };
            }
          }
          return n;
        });
      }
    }
    if (notes.length === 0) return;

    const Tone = await import('tone');
    await Tone.start();

    const { getPianoSampler, isPianoLoaded } = await import('$lib/chord-player');
    const sampler = getPianoSampler();

    // Wait for piano to load
    if (!isPianoLoaded()) {
      await new Promise<void>(resolve => {
        const check = () => isPianoLoaded() ? resolve() : setTimeout(check, 100);
        check();
      });
    }

    previewPlaying = true;
    const secondsPerTick = 60 / bpm / 480;

    for (const n of notes) {
      const timeSec = n.startTick * secondsPerTick;
      const durSec = Math.max(0.05, n.durationTicks * secondsPerTick);
      const noteName = midiToNoteName(n.midi);
      const vel = n.velocity / 127;

      const t = setTimeout(() => {
        try { sampler.triggerAttackRelease(noteName, durSec, Tone.now(), vel); } catch {}
      }, timeSec * 1000);
      previewTimeouts.push(t);
    }

    // Auto stop after all notes
    const maxTime = Math.max(...notes.map(n => (n.startTick + n.durationTicks) * secondsPerTick));
    const stopT = setTimeout(() => {
      previewPlaying = false;
      previewTimeouts = [];
    }, (maxTime + 0.5) * 1000);
    previewTimeouts.push(stopT);
  }

  function saveAndClose() {
    onSave(rawText, generatedMidiData);
    onClose();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      saveAndClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      saveAndClose();
    }
  }

  // --- Melody helpers ---
  function extractMelodyText(directivesText: string): string {
    const match = directivesText.match(/@melody\s*:\s*(.+)/);
    return match ? match[1].trim() : '';
  }

  function handleMelodyChange(text: string) {
    melodyText = text;
    // Update rawText: replace or add @melody line
    const lines = rawText.split('\n').filter(l => !l.trim().startsWith('@melody'));
    if (text.trim()) {
      lines.push(`@melody: ${text}`);
    }
    rawText = lines.join('\n');
    // Re-parse to sync directives
    const result = parseDirectives(rawText);
    directives = result.directives;
    parseErrors = result.errors.map(e => e.line ? `Line ${e.line}: ${e.message}` : e.message);
  }

  // --- MIDI preview ---
  let previewCanvas: HTMLCanvasElement | undefined = $state();
  let previewDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Parse timeSignature string "4/4" into { beats, beatValue } */
  function parseTimeSignature(ts: string): { beats: number; beatValue: number } {
    const parts = ts.split('/');
    return { beats: Number(parts[0]) || 4, beatValue: Number(parts[1]) || 4 };
  }

  /** Extract per-bar chord names for this block's bar range.
   *  Matches MultiTrackPlayer's extractChordsPerBar logic (handles sustain/repeat). */
  function extractChordsPerBar(): string[][] {
    if (!chordProgression) return [];
    const parsed = parseProgression(chordProgression);
    const resolved = resolveRepeats(parsed.bars);

    const startBar = block.startBar ?? 0;
    const endBar = block.endBar ?? startBar + 1;
    const result: string[][] = [];
    let lastChordName: string | null = null;

    // Walk all resolved bars to track lastChordName correctly
    for (let bar = 0; bar < resolved.length; bar++) {
      const barData = resolved[bar];
      if (!barData) continue;
      const chords: string[] = [];
      for (const entry of barData.entries) {
        if (entry.type === 'chord') {
          lastChordName = entry.chord.raw;
          if (bar >= startBar && bar < endBar) chords.push(entry.chord.raw);
        } else if (entry.type === 'sustain' || entry.type === 'repeat') {
          if (lastChordName && bar >= startBar && bar < endBar) chords.push(lastChordName);
        }
      }
      if (bar >= startBar && bar < endBar) {
        if (chords.length === 0 && lastChordName) chords.push(lastChordName);
        result.push(chords);
      }
    }
    return result;
  }

  /** Generate MidiNote[] from current directives — bar-by-bar to match MultiTrackPlayer. */
  function generatePreviewNotes(): MidiNote[] {
    try {
      const mode = directives.mode || 'block';
      if (mode === 'free') return []; // free mode uses MiniPianoRoll instead

      const chordsPerBar = extractChordsPerBar();
      const allChordNames = chordsPerBar.flat();
      if (allChordNames.length === 0) return [];

      const voicingType = (directives.voicing ?? 'close') as VoicingConfig['type'];
      const voicingConfig: VoicingConfig = {
        type: voicingType,
        lead: directives.lead === 'smooth' ? 'smooth' : undefined,
      };

      const voicedChords = voiceChords(allChordNames, voicingConfig);

      const rhythmConfig: RhythmConfig = {
        mode,
        swing: directives.swing,
        strum: directives.strum,
        humanize: directives.humanize,
        velocity: directives.velocity,
      };

      const ts = parseTimeSignature(timeSignature);
      const channel = 0;
      const notes: MidiNote[] = [];

      // Process bar-by-bar, matching MultiTrackPlayer pipeline
      let chordIdx = 0;
      for (let i = 0; i < chordsPerBar.length; i++) {
        const barChordCount = chordsPerBar[i].length;
        if (barChordCount === 0) continue;

        const barChords = voicedChords.slice(chordIdx, chordIdx + barChordCount);
        chordIdx += barChordCount;

        // Use i as barIdx (normalized to 0 for preview)
        const barNotes = generateRhythm(barChords, rhythmConfig, bpm, ts, i, channel);
        notes.push(...barNotes);
      }

      return notes;
    } catch {
      return [];
    }
  }

  /** Draw MidiNote[] on the preview canvas */
  function drawPreview(notes: MidiNote[]) {
    if (!previewCanvas) return;
    const rect = previewCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // Canvas not visible yet
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    const w = rect.width;
    const h = rect.height;

    previewCanvas.width = w * dpr;
    previewCanvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (notes.length === 0) return;

    // Compute bounds
    let minPitch = 127, maxPitch = 0;
    let minTick = Infinity, maxTick = 0;
    for (const n of notes) {
      if (n.midi < minPitch) minPitch = n.midi;
      if (n.midi > maxPitch) maxPitch = n.midi;
      if (n.startTick < minTick) minTick = n.startTick;
      const endTick = n.startTick + n.durationTicks;
      if (endTick > maxTick) maxTick = endTick;
    }

    // Add padding to pitch range
    minPitch = Math.max(0, minPitch - 2);
    maxPitch = Math.min(127, maxPitch + 2);
    const pitchRange = maxPitch - minPitch || 1;
    const tickRange = maxTick - minTick || 1;

    const pad = 2;
    const drawW = w - pad * 2;
    const drawH = h - pad * 2;

    // Grid lines (beat divisions)
    const ts = parseTimeSignature(timeSignature);
    const ticksPerBeat = 480 * (4 / ts.beatValue);
    ctx.strokeStyle = 'rgba(138, 126, 104, 0.1)';
    ctx.lineWidth = 1;
    const firstBeatTick = Math.ceil(minTick / ticksPerBeat) * ticksPerBeat;
    for (let tick = firstBeatTick; tick <= maxTick; tick += ticksPerBeat) {
      const x = pad + ((tick - minTick) / tickRange) * drawW;
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + drawH);
      ctx.stroke();
    }

    // Draw notes
    for (const n of notes) {
      const x = pad + ((n.startTick - minTick) / tickRange) * drawW;
      const noteW = Math.max(1.5, (n.durationTicks / tickRange) * drawW);
      // Invert Y: higher pitch = higher position
      const y = pad + ((maxPitch - n.midi) / pitchRange) * drawH;
      const noteH = Math.max(1.5, drawH / pitchRange * 0.8);

      // Amber color with velocity-based opacity
      const alpha = 0.5 + (n.velocity / 127) * 0.5;
      ctx.fillStyle = `rgba(232, 168, 76, ${alpha})`;
      ctx.fillRect(x, y - noteH / 2, noteW, noteH);
    }
  }

  // Reactive: regenerate + redraw with debounce
  let previewNotes: MidiNote[] = $state([]);

  $effect(() => {
    // Track all reactive dependencies
    void directives;
    void chordProgression;
    void bpm;
    void timeSignature;
    void generatedMidiData;

    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => {
      // If AI-generated MIDI exists, use those notes for preview
      if (generatedMidiData && generatedMidiData.notes.length > 0) {
        // Filter AI-generated notes to this block's bar range
        const ts = parseTimeSignature(timeSignature);
        const ticksPerBar = 480 * ts.beats * (4 / ts.beatValue);
        const startTick = (block.startBar ?? 0) * ticksPerBar;
        const endTick = (block.endBar ?? (block.startBar ?? 0) + 1) * ticksPerBar;
        previewNotes = generatedMidiData.notes
          .filter(n => n.startTick >= startTick && n.startTick < endTick)
          .map(n => {
            const maxDur = endTick - n.startTick;
            return n.durationTicks > maxDur ? { ...n, durationTicks: maxDur } : n;
          });
      } else {
        previewNotes = generatePreviewNotes();
      }
    }, 200);

    return () => {
      if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    };
  });

  $effect(() => {
    void previewNotes;
    void previewCanvas;
    // Wait a tick for canvas to mount when showPreviewCanvas transitions to true
    requestAnimationFrame(() => {
      drawPreview(previewNotes);
    });
  });

  let hasDirectives = $derived(
    directives.mode !== undefined ||
    directives.voicing !== undefined ||
    directives.velocity !== undefined
  );

  let showPreviewCanvas = $derived(
    (generatedMidiData && generatedMidiData.notes.length > 0) ||
    (!isFreeMode && (hasDirectives || !!chordProgression))
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="popover-overlay" role="presentation" onclick={handleOverlayClick}>
  <div class="popover" role="dialog" aria-modal="true" aria-label="Block Popover">
    {#if aiLoading}
      <div class="generating-overlay">
        <div class="generating-spinner"></div>
        <p class="generating-text">{generatingTip}</p>
      </div>
    {/if}
    <!-- Header -->
    <div class="popover-header">
      <span class="popover-title">{headerLabel}</span>
      <button class="btn-icon" onclick={saveAndClose} aria-label="Close">&times;</button>
    </div>

    <!-- Body -->
    <div class="popover-body">
      <!-- AI prompt input + generate button -->
      <div class="field">
        <div class="ai-input-row">
          <input
            type="text"
            class="ai-input"
            placeholder="スタイルを入力... (例: ジャズバラード風)"
            bind:value={aiPrompt}
            disabled={aiLoading}
            onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (!aiLoading) handleGenerate(); } }}
          />
          <button class="btn btn-primary btn-sm btn-generate" onclick={handleGenerate} disabled={aiLoading}>
            {#if aiLoading}
              <span class="spinner-sm"></span>
            {:else}
              生成
            {/if}
          </button>
        </div>
        {#if aiError}
          <div class="ai-error">{aiError}</div>
        {/if}
      </div>

      <!-- Expression slider -->
      <div class="field">
        <label class="field-label">Expression</label>
        <div class="bar-row">
          <span class="bar-label-left">Subtle</span>
          <input
            type="range"
            class="slider"
            min={0}
            max={100}
            step={1}
            bind:value={expressionSlider}
          />
          <span class="bar-label-right">Dramatic</span>
        </div>
      </div>

      <!-- Feel slider -->
      <div class="field">
        <label class="field-label">Feel</label>
        <div class="bar-row">
          <span class="bar-label-left">Tight</span>
          <input
            type="range"
            class="slider"
            min={0}
            max={100}
            step={1}
            bind:value={feelSlider}
          />
          <span class="bar-label-right">Loose</span>
        </div>
      </div>

      <!-- Section divider: プレビュー -->
      <div class="section-divider">
        <span class="section-label">プレビュー</span>
      </div>

      <!-- MIDI preview -->
      <div class="preview-box">
        {#if showPreviewCanvas}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="preview-clickable" onclick={() => pianoRollOpen = true}>
            <canvas
              class="preview-canvas"
              bind:this={previewCanvas}
            ></canvas>
          </div>
        {:else}
          <span class="preview-placeholder">スタイルを入力して「生成」を押してください</span>
        {/if}
      </div>

      <!-- Collapsible detail settings (conventional directive sliders) -->
      <!-- Mini piano roll (free mode) -->
      {#if isFreeMode}
        <div class="section-divider">
          <span class="section-label">Melody</span>
        </div>
        <MiniPianoRoll melody={melodyText} onMelodyChange={handleMelodyChange} />
      {/if}

      <!-- Raw text toggle -->
      <div class="raw-section">
        <button class="raw-toggle" onclick={() => (rawOpen = !rawOpen)}>
          <span class="raw-toggle-icon">{rawOpen ? '▾' : '▸'}</span>
          パラメータ
        </button>
        {#if rawOpen}
          <textarea
            class="raw-textarea"
            rows="6"
            value={rawText}
            oninput={onRawInput}
          ></textarea>
          {#if parseErrors.length > 0}
            <div class="parse-errors">
              {#each parseErrors as err}
                <div class="parse-error">{err}</div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>

    {#if pianoRollOpen}
      <PianoRollEditor
        notes={previewNotes}
        totalBars={block.endBar - block.startBar}
        {bpm}
        {timeSignature}
        {chordProgression}
        onNotesChange={(newNotes) => {
          if (generatedMidiData) {
            generatedMidiData = { ...generatedMidiData, notes: newNotes };
          }
        }}
        onClose={() => pianoRollOpen = false}
      />
    {/if}

    <!-- Footer -->
    <div class="popover-footer">
      <button class="footer-btn" onclick={handlePreview}>{previewPlaying ? '■ Stop' : '▶ Preview'}</button>
      <button class="footer-btn footer-btn--primary" onclick={handleOk}>OK</button>
    </div>
  </div>
</div>

<style>
  /* Overlay */
  .popover-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-popover);
  }

  /* Popover card */
  .popover {
    position: relative;
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    width: 400px;
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
  }

  .popover-title {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-icon {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0 var(--space-xs);
    line-height: 1;
    transition: color 0.15s;
  }

  .btn-icon:hover {
    color: var(--text-primary);
  }

  /* Body */
  .popover-body {
    padding: var(--space-sm) var(--space-md);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Field */
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-label {
    font-size: 0.68rem;
    font-weight: 400;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
    margin-bottom: 1px;
  }

  /* AI input row */
  .ai-input-row {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
  }

  .ai-input {
    flex: 1;
    padding: 7px 10px;
    font-size: 0.85rem;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
  }

  .ai-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
    outline: none;
  }

  .ai-input::placeholder {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .btn-generate {
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-generate:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner-sm {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .ai-error {
    font-size: 0.72rem;
    color: var(--error);
    padding: 2px 0;
  }

  /* Chip group */
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .chip {
    padding: 3px 9px;
    font-size: 0.72rem;
    font-weight: 500;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    background: var(--bg-base);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip:hover {
    border-color: var(--accent-primary);
    color: var(--text-primary);
  }

  .chip--active {
    background: var(--accent-primary);
    color: #fff;
    border-color: var(--accent-primary);
  }

  .chip--active:hover {
    background: #d09440;
    color: #fff;
  }

  /* Section divider */
  .section-divider {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .section-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(138, 126, 104, 0.08);
  }

  .section-label {
    font-size: 0.55rem;
    font-weight: 400;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0.02em;
    white-space: nowrap;
    opacity: 0.5;
  }

  /* Bar row (slider with left/right labels) */
  .bar-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .bar-label-left,
  .bar-label-right {
    font-size: 8px;
    color: var(--text-muted);
    white-space: nowrap;
    min-width: 30px;
  }

  .bar-label-left {
    text-align: right;
  }

  .bar-label-right {
    text-align: left;
  }

  /* Snap labels under slider */
  .snap-labels {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    padding: 0 34px;
  }

  .snap-labels--6 {
    grid-template-columns: repeat(6, 1fr);
  }

  .snap-label {
    font-size: 7px;
    color: var(--text-muted);
    text-align: center;
    transition: color 0.15s, font-weight 0.15s;
  }

  .snap-label--active {
    color: var(--accent-primary);
    font-weight: 700;
  }

  /* Slider */
  .slider-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 2px;
    background: var(--border-default);
    border-radius: 1px;
    outline: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-secondary);
    cursor: pointer;
    border: none;
    box-shadow: none;
  }

  .slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-secondary);
    cursor: pointer;
    border: none;
    box-shadow: none;
  }

  .slider-value {
    font-size: 0.78rem;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    min-width: 36px;
    text-align: right;
  }

  /* Preview box */
  .preview-box {
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    height: 64px;
    max-height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    overflow: hidden;
  }

  .preview-clickable {
    cursor: pointer;
    width: 100%;
    height: 100%;
  }
  .preview-clickable:hover {
    outline: 1px solid rgba(232, 168, 76, 0.3);
    border-radius: 4px;
  }

  .preview-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .preview-placeholder {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  /* Raw text section */
  .raw-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .raw-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 2px 0;
    transition: color 0.15s;
  }

  .raw-toggle:hover {
    color: var(--text-primary);
  }

  .raw-toggle-icon {
    font-size: 0.7rem;
  }

  .raw-textarea {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    padding: var(--space-sm);
    resize: vertical;
    line-height: 1.5;
  }

  .raw-textarea:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
    outline: none;
  }

  /* Parse errors */
  .parse-errors {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .parse-error {
    font-size: 0.72rem;
    font-family: var(--font-mono);
    color: var(--error);
  }

  /* Footer */
  .popover-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    gap: var(--space-xs);
    position: sticky;
    bottom: 0;
    flex-shrink: 0;
  }

  .footer-btn {
    padding: 5px 12px;
    font-size: 0.78rem;
    font-weight: 500;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--bg-base);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .footer-btn:hover {
    border-color: var(--accent-primary);
    color: var(--text-primary);
  }

  .footer-btn--primary {
    background: var(--accent-primary);
    color: #fff;
    border-color: var(--accent-primary);
  }

  .footer-btn--primary:hover {
    background: #d09440;
    border-color: #d09440;
    color: #fff;
  }

  .btn-sm {
    padding: 5px 12px;
    font-size: 0.78rem;
  }

  /* Generating overlay */
  .generating-overlay {
    position: absolute;
    inset: 0;
    background: rgba(8, 6, 4, 0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border-radius: inherit;
    z-index: 5;
  }

  .generating-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-subtle);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .generating-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: center;
    animation: fade-text 0.5s ease;
  }

  @keyframes fade-text {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
