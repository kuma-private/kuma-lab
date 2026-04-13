<script lang="ts">
	import { ehon } from '$lib/stores/ehon.svelte';

	let protagonist = $state('');
	let setting = $state('');
	let theme = $state('');
	let pageCount = $state(8);
	let protagonistImageDataUrl = $state<string | null>(null);
	let imagePreviewUrl = $derived(protagonistImageDataUrl);

	function submit() {
		ehon.submitCosmos({
			protagonist,
			setting,
			theme,
			pageCount,
			protagonistImageDataUrl: protagonistImageDataUrl ?? undefined
		});
	}

	function surprise() {
		ehon.submitCosmos({
			pageCount,
			protagonistImageDataUrl: protagonistImageDataUrl ?? undefined
		});
	}

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > 5 * 1024 * 1024) {
			alert('がぞうが おおきすぎます (5MB いか)');
			input.value = '';
			return;
		}
		try {
			const dataUrl = await resizeImage(file, 512);
			protagonistImageDataUrl = dataUrl;
		} catch {
			alert('がぞうを よみこめませんでした');
			input.value = '';
		}
	}

	function clearImage() {
		protagonistImageDataUrl = null;
	}

	function resizeImage(file: File, maxSize: number): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					let { width, height } = img;
					if (width > maxSize || height > maxSize) {
						const scale = Math.min(maxSize / width, maxSize / height);
						width = Math.round(width * scale);
						height = Math.round(height * scale);
					}
					canvas.width = width;
					canvas.height = height;
					const ctx = canvas.getContext('2d');
					if (!ctx) return reject(new Error('canvas context'));
					ctx.drawImage(img, 0, 0, width, height);
					resolve(canvas.toDataURL('image/png'));
				};
				img.onerror = () => reject(new Error('image load'));
				img.src = reader.result as string;
			};
			reader.onerror = () => reject(new Error('file read'));
			reader.readAsDataURL(file);
		});
	}
</script>

<div class="input-wrap">
	<button class="back-btn" onclick={() => ehon.reset()} aria-label="もどる">
		&larr; もどる
	</button>

	<div class="title-area">
		<h1 class="title">えほんをつくる</h1>
		<p class="subtitle">なにも いれなくても OK！ ぜんぶ じゆう</p>
	</div>

	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<label class="field">
			<span class="label">しゅじんこう</span>
			<input
				type="text"
				bind:value={protagonist}
				placeholder="れい: ももたろう / うさぎ"
				maxlength="40"
				autocomplete="off"
			/>
		</label>

		<div class="image-upload">
			<label for="protagonist-image" class="upload-label">
				&#x1F3A8; しゅじんこうの がぞう (にんい)
			</label>
			{#if imagePreviewUrl}
				<div class="image-preview">
					<img src={imagePreviewUrl} alt="プレビュー" />
					<button type="button" class="clear-image" onclick={clearImage}>
						さくじょ
					</button>
				</div>
			{:else}
				<input
					id="protagonist-image"
					type="file"
					accept="image/png,image/jpeg,image/webp"
					onchange={handleFileSelect}
					class="file-input"
				/>
			{/if}
		</div>

		<label class="field">
			<span class="label">ぶたい</span>
			<input
				type="text"
				bind:value={setting}
				placeholder="れい: うみ / もり / むかしのにほん"
				maxlength="40"
				autocomplete="off"
			/>
		</label>

		<label class="field">
			<span class="label">テーマ</span>
			<input
				type="text"
				bind:value={theme}
				placeholder="れい: ぼうけん / たからさがし"
				maxlength="40"
				autocomplete="off"
			/>
		</label>

		<label class="field">
			<span class="label">ページすう</span>
			<div class="page-count">
				{#each [5, 8, 10] as n (n)}
					<button
						type="button"
						class="page-btn"
						class:active={pageCount === n}
						onclick={() => (pageCount = n)}
					>
						{n}
					</button>
				{/each}
			</div>
		</label>

		<div class="actions">
			<button type="button" class="surprise" onclick={surprise}>
				&#x1F3B2; おまかせ
			</button>
			<button type="submit" class="go">
				えほんを つくる &rarr;
			</button>
		</div>
	</form>
</div>

<style>
	.input-wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding: 40px 20px;
		width: min(520px, 94vw);
	}

	.back-btn {
		position: absolute;
		top: 8px;
		left: 8px;
		background: rgba(255, 255, 255, 0.9);
		color: #3d2b1f;
		border: 1.5px solid rgba(90, 50, 20, 0.3);
		padding: 8px 16px;
		font-size: 0.9rem;
		font-weight: 700;
		border-radius: 999px;
		z-index: 10;
	}

	.title-area {
		text-align: center;
	}

	.title {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: clamp(1.5rem, 3.5vw, 2.1rem);
		font-weight: 700;
		background: linear-gradient(135deg, #0ea5e9 0%, #f472b6 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
		margin-bottom: 6px;
		letter-spacing: 0.08em;
	}

	.subtitle {
		font-size: 0.9rem;
		color: #6b3e1f;
		opacity: 0.85;
	}

	.form {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 18px;
		background: rgba(255, 255, 255, 0.88);
		padding: 28px 24px;
		border-radius: 24px;
		border: 1.5px solid rgba(90, 50, 20, 0.18);
		box-shadow:
			0 12px 30px rgba(20, 10, 0, 0.12),
			inset 0 1px 0 rgba(255, 255, 255, 0.9);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-size: 0.8rem;
		font-weight: 700;
		color: #6b3e1f;
		letter-spacing: 0.05em;
	}

	.field input[type='text'] {
		padding: 12px 14px;
		border-radius: 14px;
		border: 1.5px solid rgba(90, 50, 20, 0.25);
		background: #fffaf0;
		font-family: inherit;
		font-size: 1rem;
		color: #3d2b1f;
	}

	.field input[type='text']::placeholder {
		color: #b89477;
	}

	.field input[type='text']:focus {
		outline: none;
		border-color: #0ea5e9;
		box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);
	}

	.page-count {
		display: flex;
		gap: 10px;
	}

	.page-btn {
		flex: 1;
		padding: 10px 0;
		border-radius: 12px;
		border: 1.5px solid rgba(90, 50, 20, 0.25);
		background: #fffaf0;
		font-family: inherit;
		font-weight: 800;
		font-size: 1rem;
		color: #3d2b1f;
		transition: all 0.2s ease;
	}

	.page-btn.active {
		background: linear-gradient(135deg, #0ea5e9 0%, #f472b6 100%);
		color: #fff;
		border-color: transparent;
		box-shadow: 0 4px 10px rgba(14, 165, 233, 0.3);
	}

	.actions {
		display: flex;
		gap: 12px;
		margin-top: 6px;
	}

	.surprise,
	.go {
		flex: 1;
		padding: 14px 18px;
		border-radius: 999px;
		font-family: inherit;
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		transition: transform 0.15s ease;
	}

	.surprise {
		background: rgba(255, 237, 203, 0.9);
		color: #6b3e1f;
		border: 1.5px solid rgba(90, 50, 20, 0.35);
	}

	.go {
		background: linear-gradient(135deg, #0ea5e9 0%, #f472b6 100%);
		color: #fff;
		box-shadow: 0 6px 16px rgba(14, 165, 233, 0.35);
	}

	.surprise:active,
	.go:active {
		transform: scale(0.95);
	}

	.image-upload {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.upload-label {
		display: block;
		font-size: 0.8rem;
		font-weight: 700;
		color: #6b3e1f;
		letter-spacing: 0.05em;
	}

	.image-preview {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.image-preview img {
		width: 80px;
		height: 80px;
		object-fit: cover;
		border-radius: 12px;
		border: 2px solid rgba(107, 62, 31, 0.3);
		background: #fffaf0;
	}

	.clear-image {
		background: rgba(255, 200, 200, 0.9);
		color: #8a2b2b;
		border: 1.5px solid rgba(138, 43, 43, 0.4);
		padding: 8px 16px;
		border-radius: 999px;
		font-family: inherit;
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.file-input {
		width: 100%;
		padding: 10px 12px;
		background: #fffaf0;
		border: 1.5px dashed rgba(90, 50, 20, 0.4);
		border-radius: 14px;
		font-family: inherit;
		font-size: 0.9rem;
		color: #6b3e1f;
		cursor: pointer;
	}
</style>
