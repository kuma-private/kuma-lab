export type Genre = 'doubutsu' | 'yasai' | 'norimono';

export type QuizPhase = 'select' | 'loading' | 'quiz' | 'complete';

export interface QuizItem {
	name: string;
	url: string;
	sound: string;
	description: string;
}

export type BlurStage = 0 | 1 | 2 | 3;
