import type { EhonStory } from '$lib/types';

const RIVER =
	'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhtEGpbaXvoPyd998QTYA0Bb-fCFi_4DEanbpIB4RSoApek0xWeSXgzFlD-3AXt0MCGUbNeMUUCeU4hVHhZ57XS26CS5dnN4DXZ0pjjuDwEi3fYT7n4u6BRWhZpnaWNcNGsAVIMpXjUcMVl/s1600/jiko_river_kasen_camera.png';
const PEACH =
	'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjIYXrQLKSq_oU9rqSWTa2ReT-0pA-Lg6IgX6-_Ya9bPKqoAyoSlmIxo22lPh02Pu5WK6_J_twm0JePRiggLlkNTZ3GilccnR1gF1Pfe3_onoBh5dUGX_O3FtUwiCWZiiMZhoVd2NBZxY3m/s1600/cut_fruit_peach.png';
const OLDMAN =
	'https://1.bp.blogspot.com/-mJ3lK7pVmtY/U6QY7rYkU4I/AAAAAAAAhW0/7Gf5NfmY5Ks/s800/ojiisan.png';
const OLDWOMAN =
	'https://1.bp.blogspot.com/-YjHqgKLbBVI/U6QY7wL-DJI/AAAAAAAAhXE/GkFzJ7j0y6o/s800/obaasan.png';
const DOG =
	'https://1.bp.blogspot.com/-2qLQQ3y3xsc/VhHVLN8OiEI/AAAAAAAAzQc/W0P7yqpqd78/s800/dog_shiba.png';
const MONKEY =
	'https://1.bp.blogspot.com/-Sd0pCCsP5TI/VpWVpzcPzHI/AAAAAAAA2vI/ZI9cQYHqJ2U/s800/animal_saru.png';
const BIRD =
	'https://1.bp.blogspot.com/-sPJ8zA5oQBs/VeMYn0KZvnI/AAAAAAAAxBE/0kN3Fc1Ql4k/s800/bird_kiji.png';
const ONI =
	'https://1.bp.blogspot.com/-9n2rMFmJVyY/U6QYbeWY8AI/AAAAAAAAhUc/c6gxQpWjzYw/s800/namahage.png';

export const mockMomotaro: EhonStory = {
	title: 'ももたろう おにたいじ',
	mode: 'cosmos',
	aspectRatio: '4:3',
	pages: [
		{
			pageNumber: 1,
			text: 'むかしむかし、おおきな かわに、どんぶらこ どんぶらこと、おおきな ももが ながれてきました。',
			elements: [
				{
					imageId: 'river',
					image: { title: 'かわ', imageUrl: RIVER, pageUrl: '' },
					x: 0,
					y: 0,
					width: 1,
					height: 1,
					rotation: 0,
					flipHorizontal: false,
					zIndex: 0
				},
				{
					imageId: 'momo',
					image: { title: 'もも', imageUrl: PEACH, pageUrl: '' },
					x: 0.42,
					y: 0.38,
					width: 0.18,
					height: 0.22,
					rotation: 8,
					flipHorizontal: false,
					zIndex: 1
				}
			]
		},
		{
			pageNumber: 2,
			text: 'おばあさんが ももを わると、なかから げんきな おとこのこが うまれました。',
			elements: [
				{
					imageId: 'oldwoman',
					image: { title: 'おばあさん', imageUrl: OLDWOMAN, pageUrl: '' },
					x: 0.1,
					y: 0.25,
					width: 0.32,
					height: 0.6,
					rotation: 0,
					flipHorizontal: false,
					zIndex: 1
				},
				{
					imageId: 'momo2',
					image: { title: 'もも', imageUrl: PEACH, pageUrl: '' },
					x: 0.5,
					y: 0.35,
					width: 0.28,
					height: 0.4,
					rotation: -5,
					flipHorizontal: false,
					zIndex: 2
				}
			]
		},
		{
			pageNumber: 3,
			text: 'ももたろうは すくすく そだち、おにたいじに いくことに しました。',
			elements: [
				{
					imageId: 'oldman',
					image: { title: 'おじいさん', imageUrl: OLDMAN, pageUrl: '' },
					x: 0.1,
					y: 0.25,
					width: 0.3,
					height: 0.6,
					rotation: 0,
					flipHorizontal: false,
					zIndex: 1
				},
				{
					imageId: 'oldwoman3',
					image: { title: 'おばあさん', imageUrl: OLDWOMAN, pageUrl: '' },
					x: 0.6,
					y: 0.25,
					width: 0.3,
					height: 0.6,
					rotation: 0,
					flipHorizontal: true,
					zIndex: 1
				}
			]
		},
		{
			pageNumber: 4,
			text: 'みちのとちゅうで、いぬと さると きじが なかまに なりました。',
			elements: [
				{
					imageId: 'dog',
					image: { title: 'いぬ', imageUrl: DOG, pageUrl: '' },
					x: 0.05,
					y: 0.4,
					width: 0.25,
					height: 0.45,
					rotation: 0,
					flipHorizontal: false,
					zIndex: 1
				},
				{
					imageId: 'monkey',
					image: { title: 'さる', imageUrl: MONKEY, pageUrl: '' },
					x: 0.38,
					y: 0.35,
					width: 0.24,
					height: 0.5,
					rotation: -4,
					flipHorizontal: false,
					zIndex: 2
				},
				{
					imageId: 'bird',
					image: { title: 'きじ', imageUrl: BIRD, pageUrl: '' },
					x: 0.7,
					y: 0.4,
					width: 0.25,
					height: 0.45,
					rotation: 3,
					flipHorizontal: false,
					zIndex: 1
				}
			]
		},
		{
			pageNumber: 5,
			text: 'ももたろうたちは おにを やっつけて、みんなで なかよく かえりました。めでたし めでたし。',
			elements: [
				{
					imageId: 'oni',
					image: { title: 'おに', imageUrl: ONI, pageUrl: '' },
					x: 0.55,
					y: 0.2,
					width: 0.35,
					height: 0.7,
					rotation: -8,
					flipHorizontal: false,
					zIndex: 1
				},
				{
					imageId: 'dog5',
					image: { title: 'いぬ', imageUrl: DOG, pageUrl: '' },
					x: 0.08,
					y: 0.5,
					width: 0.22,
					height: 0.4,
					rotation: 0,
					flipHorizontal: true,
					zIndex: 2
				}
			]
		}
	]
};

export const mockChaos: EhonStory = {
	title: 'ぐちゃぐちゃ ぼうけん',
	mode: 'chaos',
	aspectRatio: '4:3',
	pages: [
		{
			pageNumber: 1,
			text: 'ある ひ、そらから おおきな ももが ふってきました。',
			elements: [
				{
					imageId: 'momo1',
					image: { title: 'もも', imageUrl: PEACH, pageUrl: '' },
					x: 0.3,
					y: 0.1,
					width: 0.4,
					height: 0.5,
					rotation: 22,
					flipHorizontal: false,
					zIndex: 2
				},
				{
					imageId: 'oni1',
					image: { title: 'おに', imageUrl: ONI, pageUrl: '' },
					x: 0.0,
					y: 0.4,
					width: 0.3,
					height: 0.55,
					rotation: -12,
					flipHorizontal: true,
					zIndex: 1
				}
			]
		},
		{
			pageNumber: 2,
			text: 'いぬが さけんで、さるが おどって、きじが うたいました。',
			elements: [
				{
					imageId: 'dog2',
					image: { title: 'いぬ', imageUrl: DOG, pageUrl: '' },
					x: 0.05,
					y: 0.35,
					width: 0.3,
					height: 0.55,
					rotation: 15,
					flipHorizontal: false,
					zIndex: 1
				},
				{
					imageId: 'monkey2',
					image: { title: 'さる', imageUrl: MONKEY, pageUrl: '' },
					x: 0.38,
					y: 0.2,
					width: 0.28,
					height: 0.6,
					rotation: -20,
					flipHorizontal: false,
					zIndex: 2
				},
				{
					imageId: 'bird2',
					image: { title: 'きじ', imageUrl: BIRD, pageUrl: '' },
					x: 0.68,
					y: 0.35,
					width: 0.28,
					height: 0.5,
					rotation: 18,
					flipHorizontal: false,
					zIndex: 1
				}
			]
		},
		{
			pageNumber: 3,
			text: 'おばあさんが にんじゃに へんしん、おじいさんは そらを とびました。',
			elements: [
				{
					imageId: 'oldw3',
					image: { title: 'おばあさん', imageUrl: OLDWOMAN, pageUrl: '' },
					x: 0.1,
					y: 0.3,
					width: 0.35,
					height: 0.65,
					rotation: -10,
					flipHorizontal: false,
					zIndex: 1
				},
				{
					imageId: 'oldm3',
					image: { title: 'おじいさん', imageUrl: OLDMAN, pageUrl: '' },
					x: 0.55,
					y: 0.1,
					width: 0.35,
					height: 0.6,
					rotation: 25,
					flipHorizontal: false,
					zIndex: 2
				}
			]
		},
		{
			pageNumber: 4,
			text: 'おには びっくりして、かわに とびこみ、さかなに なりました。',
			elements: [
				{
					imageId: 'river4',
					image: { title: 'かわ', imageUrl: RIVER, pageUrl: '' },
					x: 0,
					y: 0.3,
					width: 1,
					height: 0.7,
					rotation: 0,
					flipHorizontal: false,
					zIndex: 0
				},
				{
					imageId: 'oni4',
					image: { title: 'おに', imageUrl: ONI, pageUrl: '' },
					x: 0.35,
					y: 0.15,
					width: 0.35,
					height: 0.55,
					rotation: 165,
					flipHorizontal: false,
					zIndex: 2
				}
			]
		},
		{
			pageNumber: 5,
			text: 'そして みんなは ももを たべて、しあわせに くらしましたとさ。',
			elements: [
				{
					imageId: 'momo5',
					image: { title: 'もも', imageUrl: PEACH, pageUrl: '' },
					x: 0.35,
					y: 0.25,
					width: 0.3,
					height: 0.5,
					rotation: -6,
					flipHorizontal: false,
					zIndex: 2
				},
				{
					imageId: 'dog5c',
					image: { title: 'いぬ', imageUrl: DOG, pageUrl: '' },
					x: 0.0,
					y: 0.45,
					width: 0.24,
					height: 0.5,
					rotation: 10,
					flipHorizontal: false,
					zIndex: 1
				},
				{
					imageId: 'monkey5c',
					image: { title: 'さる', imageUrl: MONKEY, pageUrl: '' },
					x: 0.75,
					y: 0.4,
					width: 0.23,
					height: 0.55,
					rotation: -8,
					flipHorizontal: true,
					zIndex: 1
				}
			]
		}
	]
};
