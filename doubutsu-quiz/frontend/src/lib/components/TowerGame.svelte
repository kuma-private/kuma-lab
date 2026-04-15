<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Matter from 'matter-js';
	import { tower } from '$lib/stores/tower.svelte';
	import { tracePolygon } from '$lib/towerPhysics';

	const ASPECT = 9 / 16;
	const MAX_W = 420;
	const PLAY_MAX_EDGE = 78;
	const ISLAND_W_RATIO = 0.6;
	const ISLAND_H = 34;
	const ISLAND_MARGIN_BOTTOM = 30;
	const MOVE_STEP = 8;
	const TAP_STEP = 36;
	const FALL_OFF_OFFSET = 140;
	const BODY_DENSITY = 0.0009;
	const BODY_RESTITUTION = 0.22;
	const BODY_FRICTION = 0.85;

	let container: HTMLDivElement;
	let canvasWrap: HTMLDivElement;

	let canvasW = $state(360);
	let canvasH = $state(640);
	let previewX = $state(180);
	let gameOverFired = $state(false);
	let isDropping = $state(false);

	let engine: Matter.Engine | null = null;
	let render: Matter.Render | null = null;
	let runner: Matter.Runner | null = null;

	type Tracked = { body: Matter.Body; stillIn: boolean };
	const tracked: Tracked[] = [];
	let droppedCount = $state(0);

	const currentEntry = $derived(tower.entries[tower.nextIndex] ?? null);
	const currentTitle = $derived(
		currentEntry ? currentEntry.title.replace(/\s*のイラスト/g, '').trim() : ''
	);

	const islandTopY = $derived(canvasH - ISLAND_MARGIN_BOTTOM - ISLAND_H);
	const islandW = $derived(Math.round(canvasW * ISLAND_W_RATIO));
	const islandLeft = $derived(Math.round((canvasW - islandW) / 2));

	function measureCanvas() {
		if (!container) return;
		const parentW = container.clientWidth || window.innerWidth;
		const parentH = container.clientHeight || window.innerHeight;
		let w = Math.min(parentW, MAX_W);
		let h = w / ASPECT;
		if (h > parentH - 160) {
			h = Math.max(parentH - 160, 400);
			w = h * ASPECT;
		}
		canvasW = Math.round(w);
		canvasH = Math.round(h);
		previewX = Math.round(canvasW / 2);
	}

	function makeIsland() {
		if (!engine) return;
		const islandX = canvasW / 2;
		const islandY = canvasH - ISLAND_MARGIN_BOTTOM - ISLAND_H / 2;
		const island = Matter.Bodies.rectangle(islandX, islandY, islandW, ISLAND_H, {
			isStatic: true,
			label: 'island',
			friction: 0.9,
			render: { fillStyle: '#4a8e3c' }
		});
		Matter.World.add(engine.world, island);
	}

	function setupEngine() {
		if (!canvasWrap) return;
		engine = Matter.Engine.create();
		engine.world.gravity.y = 1;

		render = Matter.Render.create({
			element: canvasWrap,
			engine,
			options: {
				width: canvasW,
				height: canvasH,
				wireframes: false,
				background: 'transparent',
				pixelRatio: window.devicePixelRatio || 1
			}
		});

		makeIsland();
		Matter.Render.run(render);

		runner = Matter.Runner.create();
		Matter.Runner.run(runner, engine);

		Matter.Events.on(engine, 'afterUpdate', checkLost);
	}

	function teardownEngine() {
		if (!engine) return;
		Matter.Events.off(engine, 'afterUpdate', checkLost);
		if (runner) Matter.Runner.stop(runner);
		if (render) {
			Matter.Render.stop(render);
			render.canvas?.remove();
			render.textures = {};
		}
		Matter.World.clear(engine.world, false);
		Matter.Engine.clear(engine);
		engine = null;
		render = null;
		runner = null;
		tracked.length = 0;
		droppedCount = 0;
	}

	function checkLost() {
		if (gameOverFired) return;
		const threshold = canvasH + FALL_OFF_OFFSET;
		for (const t of tracked) {
			if (!t.stillIn) continue;
			if (t.body.position.y > threshold) {
				t.stillIn = false;
				fireGameOver();
				return;
			}
		}
	}

	function fireGameOver() {
		if (gameOverFired) return;
		gameOverFired = true;
		const surviving = tracked.filter((t) => t.stillIn).length;
		if (runner) Matter.Runner.stop(runner);
		tower.gameOver(surviving);
	}

	async function drop() {
		if (!engine || gameOverFired || isDropping || !currentEntry) return;
		isDropping = true;
		const entry = currentEntry;
		try {
			const shape = await tracePolygon(entry.imageUrl);
			if (!engine || gameOverFired) return;

			let body: Matter.Body | undefined;
			if (shape) {
				const playScale = PLAY_MAX_EDGE / Math.max(shape.width, shape.height);
				const scaled = shape.hull.map((v) => ({ x: v.x * playScale, y: v.y * playScale }));
				const naturalLonger = Math.max(shape.naturalWidth, shape.naturalHeight);
				const textureScale = PLAY_MAX_EDGE / naturalLonger;
				body = Matter.Bodies.fromVertices(
					previewX,
					-PLAY_MAX_EDGE,
					[scaled],
					{
						restitution: BODY_RESTITUTION,
						friction: BODY_FRICTION,
						frictionStatic: 1.1,
						density: BODY_DENSITY,
						render: {
							sprite: {
								texture: entry.imageUrl,
								xScale: textureScale,
								yScale: textureScale
							}
						}
					},
					false
				);
			}

			if (!body) {
				// Alpha trace failed (network, tiny image) — fall back to a plain
				// rectangle so the run isn't blocked.
				const natW = shape?.naturalWidth ?? PLAY_MAX_EDGE;
				const natH = shape?.naturalHeight ?? PLAY_MAX_EDGE;
				const naturalLonger = Math.max(natW, natH);
				const w = (PLAY_MAX_EDGE * natW) / naturalLonger;
				const h = (PLAY_MAX_EDGE * natH) / naturalLonger;
				const textureScale = PLAY_MAX_EDGE / naturalLonger;
				body = Matter.Bodies.rectangle(previewX, -h, w, h, {
					restitution: BODY_RESTITUTION,
					friction: BODY_FRICTION,
					density: BODY_DENSITY,
					render: {
						sprite: {
							texture: entry.imageUrl,
							xScale: textureScale,
							yScale: textureScale
						}
					}
				});
			}

			Matter.World.add(engine!.world, body);
			tracked.push({ body, stillIn: true });
			droppedCount++;
			tower.advance();
		} finally {
			isDropping = false;
		}
	}

	function clampPreview(next: number) {
		const margin = 50;
		previewX = Math.max(margin, Math.min(canvasW - margin, next));
	}

	function onKey(e: KeyboardEvent) {
		if (gameOverFired) return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			clampPreview(previewX - MOVE_STEP);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			clampPreview(previewX + MOVE_STEP);
		} else if (e.key === ' ' || e.code === 'Space') {
			e.preventDefault();
			void drop();
		}
	}

	function onCanvasTap(e: PointerEvent) {
		if (gameOverFired) return;
		e.preventDefault();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		if (x < rect.width / 2) clampPreview(previewX - TAP_STEP);
		else clampPreview(previewX + TAP_STEP);
	}

	function handleQuit() {
		if (gameOverFired) return;
		fireGameOver();
	}

	function handleDropClick(e: Event) {
		e.preventDefault();
		void drop();
	}

	const previewStyle = $derived.by(() => {
		if (!currentEntry) return '';
		return `left: ${previewX}px;`;
	});

	onMount(() => {
		measureCanvas();
		setupEngine();
		window.addEventListener('keydown', onKey);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', onKey);
		teardownEngine();
	});
</script>

<div class="tower-root" bind:this={container}>
	<div class="hud">
		<div class="hud-score">スコア: {droppedCount}</div>
		<div class="hud-best">ベスト: {tower.best}</div>
	</div>

	<div
		class="canvas-wrap"
		bind:this={canvasWrap}
		style="width: {canvasW}px; height: {canvasH}px;"
		onpointerdown={onCanvasTap}
		role="application"
		aria-label="どうぶつタワー"
	>
		<div
			class="grass"
			style="left: {islandLeft}px; width: {islandW}px; bottom: {ISLAND_MARGIN_BOTTOM + ISLAND_H}px;"
		>
			{#each Array.from({ length: Math.ceil(islandW / 14) }) as _, i (i)}
				<span class="blade"></span>
			{/each}
		</div>

		{#if currentEntry}
			<div class="bubble" style="left: {previewX}px;">
				{currentTitle}
			</div>
			<div class="preview" style={previewStyle}>
				<img
					src={currentEntry.imageUrl}
					alt={currentTitle}
					draggable="false"
				/>
				<div class="preview-arrow"></div>
			</div>
		{/if}
	</div>

	<button class="drop-btn" onclick={handleDropClick} disabled={isDropping || gameOverFired}>
		おとす!
	</button>
	<button class="quit-btn" onclick={handleQuit}>やめる</button>
</div>

<style>
	.tower-root {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 14px 10px 24px;
		width: 100%;
		max-width: 480px;
		min-height: 100vh;
		background: linear-gradient(180deg, #87ceeb 0%, #bfe4f5 55%, #e0f6ff 100%);
		overflow: hidden;
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		touch-action: manipulation;
		user-select: none;
	}

	.hud {
		position: relative;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		max-width: 420px;
		padding: 0 6px;
	}

	.hud-score,
	.hud-best {
		padding: 8px 16px;
		background: rgba(255, 255, 255, 0.92);
		border: 1.5px solid rgba(90, 50, 20, 0.3);
		border-radius: 999px;
		font-size: 1rem;
		font-weight: 900;
		color: #3d2b1f;
		box-shadow: 0 3px 0 rgba(90, 50, 20, 0.15);
	}

	.hud-best {
		color: #5c6bc0;
	}

	.canvas-wrap {
		position: relative;
		z-index: 1;
		border-radius: 14px;
		overflow: hidden;
		box-shadow:
			0 10px 24px rgba(40, 70, 110, 0.25),
			inset 0 0 0 2px rgba(255, 255, 255, 0.7);
		background: linear-gradient(180deg, #aee1f5 0%, #cff0fb 100%);
		touch-action: none;
	}

	.canvas-wrap :global(canvas) {
		display: block;
		filter: drop-shadow(0 4px 6px rgba(20, 40, 80, 0.15));
	}

	.grass {
		position: absolute;
		height: 12px;
		display: flex;
		justify-content: space-between;
		z-index: 3;
		pointer-events: none;
	}

	.blade {
		width: 0;
		height: 0;
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-bottom: 14px solid #3ea03a;
		filter: drop-shadow(0 1px 0 #2e7a2c);
	}

	.preview {
		position: absolute;
		top: 46px;
		transform: translateX(-50%);
		z-index: 4;
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 78px;
		height: 78px;
	}

	.preview img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		filter: drop-shadow(0 3px 6px rgba(40, 70, 110, 0.35));
	}

	.preview-arrow {
		position: absolute;
		bottom: -14px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 10px solid transparent;
		border-right: 10px solid transparent;
		border-top: 14px solid #f97316;
		filter: drop-shadow(0 2px 2px rgba(80, 30, 0, 0.25));
	}

	.bubble {
		position: absolute;
		top: 10px;
		transform: translateX(-50%);
		z-index: 5;
		padding: 6px 14px;
		background: rgba(255, 255, 255, 0.95);
		border: 1.5px solid rgba(92, 107, 192, 0.45);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 800;
		color: #3d2b1f;
		white-space: nowrap;
		box-shadow: 0 3px 8px rgba(40, 70, 110, 0.2);
		pointer-events: none;
		max-width: 86%;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.drop-btn {
		position: relative;
		z-index: 2;
		width: min(420px, 96%);
		height: 72px;
		border: none;
		border-radius: 18px;
		font-family: inherit;
		font-size: 1.6rem;
		font-weight: 900;
		letter-spacing: 0.08em;
		color: #fff;
		background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);
		box-shadow:
			0 8px 0 #b45309,
			0 14px 22px rgba(180, 80, 0, 0.35),
			inset 0 2px 0 rgba(255, 255, 255, 0.6);
		transition: transform 0.08s ease, box-shadow 0.08s ease;
		cursor: pointer;
	}

	.drop-btn:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.drop-btn:not(:disabled):active {
		transform: translateY(4px);
		box-shadow:
			0 4px 0 #b45309,
			0 8px 14px rgba(180, 80, 0, 0.3),
			inset 0 2px 0 rgba(255, 255, 255, 0.6);
	}

	.quit-btn {
		position: relative;
		z-index: 2;
		background: transparent;
		border: none;
		color: #5c6bc0;
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
		padding: 4px 10px;
	}
</style>
