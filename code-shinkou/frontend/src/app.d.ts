// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

declare namespace YT {
	class Player {
		constructor(element: HTMLElement, config: PlayerConfig);
		getCurrentTime(): number;
		destroy(): void;
	}

	interface PlayerConfig {
		videoId: string;
		width?: string | number;
		height?: string | number;
		playerVars?: Record<string, unknown>;
		events?: Record<string, (event: unknown) => void>;
	}
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
