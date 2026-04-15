declare module 'poly-decomp' {
	type Point = [number, number];
	type Polygon = Point[];
	interface PolyDecomp {
		decomp(polygon: Polygon): Polygon[];
		quickDecomp(polygon: Polygon): Polygon[];
		isSimple(polygon: Polygon): boolean;
		removeCollinearPoints(polygon: Polygon, thresholdAngle?: number): number;
		removeDuplicatePoints(polygon: Polygon, precision?: number): number;
		makeCCW(polygon: Polygon): boolean;
	}
	const decomp: PolyDecomp;
	export default decomp;
}
