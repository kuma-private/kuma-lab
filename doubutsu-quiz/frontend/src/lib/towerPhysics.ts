export interface TracedShape {
	/// Convex hull vertices in local coordinates, centered on the shape's
	/// bounding-box centre. Units are the downsampled pixel space (max edge
	/// ~TRACE_MAX_EDGE), not canvas pixels — callers must scale them up.
	hull: Array<{ x: number; y: number }>;
	/// Bounding box of the hull in downsampled pixel coords.
	width: number;
	height: number;
	naturalWidth: number;
	naturalHeight: number;
	imgSrc: string;
}

const TRACE_MAX_EDGE = 80;
const ALPHA_THRESHOLD = 48;
const cache = new Map<string, Promise<TracedShape | null>>();

function proxyUrl(src: string): string {
	return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

function loadProxiedImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`image load failed: ${src}`));
		img.src = proxyUrl(src);
	});
}

function buildAlphaMask(
	img: HTMLImageElement,
	maxEdge: number
): { mask: Uint8Array; w: number; h: number } | null {
	const srcW = img.naturalWidth;
	const srcH = img.naturalHeight;
	if (srcW === 0 || srcH === 0) return null;
	const longer = Math.max(srcW, srcH);
	const scale = Math.min(1, maxEdge / longer);
	const w = Math.max(4, Math.round(srcW * scale));
	const h = Math.max(4, Math.round(srcH * scale));

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	ctx.drawImage(img, 0, 0, w, h);
	const imgData = ctx.getImageData(0, 0, w, h);
	const mask = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) {
		mask[i] = imgData.data[i * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;
	}
	return { mask, w, h };
}

// Collect boundary pixels from the alpha mask. A pixel is on the boundary if
// it's opaque AND at least one 4-neighbor is transparent or out of bounds.
// Feeds into the convex hull — we only need extreme points.
function collectBoundaryPoints(mask: Uint8Array, w: number, h: number): [number, number][] {
	const points: [number, number][] = [];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!mask[y * w + x]) continue;
			if (
				x === 0 ||
				x === w - 1 ||
				y === 0 ||
				y === h - 1 ||
				!mask[(y - 1) * w + x] ||
				!mask[(y + 1) * w + x] ||
				!mask[y * w + (x - 1)] ||
				!mask[y * w + (x + 1)]
			) {
				points.push([x, y]);
			}
		}
	}
	return points;
}

// Andrew's monotone chain convex hull. Returns vertices in counter-clockwise
// order for canvas-coordinate inputs (y-down), which Matter.Bodies.fromVertices
// accepts directly.
function convexHull(points: [number, number][]): [number, number][] {
	if (points.length < 3) return points.slice();
	const sorted = points.slice().sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));

	const cross = (
		o: [number, number],
		a: [number, number],
		b: [number, number]
	) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

	const lower: [number, number][] = [];
	for (const p of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
			lower.pop();
		}
		lower.push(p);
	}
	const upper: [number, number][] = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const p = sorted[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
			upper.pop();
		}
		upper.push(p);
	}
	upper.pop();
	lower.pop();
	return lower.concat(upper);
}

export function tracePolygon(src: string): Promise<TracedShape | null> {
	const cached = cache.get(src);
	if (cached) return cached;

	const promise = (async () => {
		try {
			const img = await loadProxiedImage(src);
			const result = buildAlphaMask(img, TRACE_MAX_EDGE);
			if (!result) return null;
			const { mask, w, h } = result;

			const boundary = collectBoundaryPoints(mask, w, h);
			if (boundary.length < 3) return null;

			const hullArr = convexHull(boundary);
			if (hullArr.length < 3) return null;

			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const [x, y] of hullArr) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
			const bboxW = maxX - minX;
			const bboxH = maxY - minY;
			if (bboxW < 4 || bboxH < 4) return null;
			const cx = (minX + maxX) / 2;
			const cy = (minY + maxY) / 2;

			const hull = hullArr.map(([x, y]) => ({ x: x - cx, y: y - cy }));

			return {
				hull,
				width: bboxW,
				height: bboxH,
				naturalWidth: img.naturalWidth,
				naturalHeight: img.naturalHeight,
				imgSrc: src
			};
		} catch {
			return null;
		}
	})();

	cache.set(src, promise);
	return promise;
}
