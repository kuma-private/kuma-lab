export type Genre = 'doubutsu' | 'yasai' | 'norimono';

export type QuizPhase = 'select' | 'loading' | 'quiz' | 'complete';

export interface QuizItem {
	name: string;
	url: string;
	sound: string;
	description: string;
}

export type BlurStage = 0 | 1 | 2 | 3;

// Ehon (instant picture book) types
export type EhonMode = 'chaos' | 'cosmos';

export interface EhonImage {
	title: string;
	imageUrl: string;
	pageUrl: string;
}

export interface EhonElement {
	imageId: string;
	image: EhonImage;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	flipHorizontal: boolean;
	zIndex: number;
}

export interface EhonPage {
	pageNumber: number;
	text: string;
	elements: EhonElement[];
}

export interface EhonStory {
	title: string;
	mode: EhonMode;
	aspectRatio: string;
	pages: EhonPage[];
}

export interface EhonGenerateRequest {
	mode: EhonMode;
	pageCount?: number;
	protagonist?: string;
	setting?: string;
	theme?: string;
	protagonistImageDataUrl?: string;
}

// Nazenaze (why-why kamishibai) types
export type NazenazeMode = 'true' | 'false';

export interface NazenazeStory {
	title: string;
	mode: NazenazeMode;
	aspectRatio: string;
	pages: EhonPage[];
}

export type NazenazePage = EhonPage;
export type NazenazeElement = EhonElement;

export interface NazenazeGenerateRequest {
	mode: NazenazeMode;
	question: string;
	pageCount: number;
}
