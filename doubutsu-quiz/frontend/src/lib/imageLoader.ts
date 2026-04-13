// Throttled image preloader.
// Limits how many image fetches are in flight at once so we don't hammer
// blogger.googleusercontent.com (Cloudflare/Google may rate-limit at high
// concurrency, causing partial failures across an ehon page).

const MAX_PARALLEL = 5;

type Job = () => void;

const queue: Job[] = [];
let inFlight = 0;
const cache = new Map<string, Promise<string>>();

function tryDispatch() {
	while (inFlight < MAX_PARALLEL && queue.length > 0) {
		const job = queue.shift()!;
		inFlight++;
		job();
	}
}

export function loadImage(src: string): Promise<string> {
	const cached = cache.get(src);
	if (cached) return cached;

	const promise = new Promise<string>((resolve, reject) => {
		const start: Job = () => {
			const img = new Image();
			img.onload = () => {
				inFlight--;
				tryDispatch();
				resolve(src);
			};
			img.onerror = () => {
				inFlight--;
				tryDispatch();
				reject(new Error(`Failed to load image: ${src}`));
			};
			img.src = src;
		};
		queue.push(start);
		tryDispatch();
	});

	cache.set(src, promise);
	return promise;
}
