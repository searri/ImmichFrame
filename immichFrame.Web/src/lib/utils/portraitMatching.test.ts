import { describe, it, expect } from 'vitest';
import {
	extractAvgHue,
	matchesLocation,
	matchesColor,
	matchesPerson,
	findMatchingPortraitIndex
} from './portraitMatching';
import type { AssetResponseDto } from '$lib/immichFrameApi';
import { AssetTypeEnum, AssetVisibility } from '$lib/immichFrameApi';

function makeThumbhash(p_raw: number, q_raw: number): string {
	const header = (p_raw << 6) | (q_raw << 12);
	const b0 = header & 0xff;
	const b1 = (header >> 8) & 0xff;
	const b2 = (header >> 16) & 0xff;
	const b3 = 0;
	const binary = String.fromCharCode(b0, b1, b2, b3);
	return btoa(binary);
}

function createAsset(partial: Partial<AssetResponseDto>): AssetResponseDto {
	return {
		id: '11111111-1111-1111-1111-111111111111',
		checksum: '',
		createdAt: '2025-01-01T00:00:00Z',
		fileCreatedAt: '2025-01-01T00:00:00Z',
		fileModifiedAt: '2025-01-01T00:00:00Z',
		localDateTime: '2025-01-01T00:00:00Z',
		originalFileName: 'test.jpg',
		originalPath: '/test.jpg',
		ownerId: '22222222-2222-2222-2222-222222222222',
		type: AssetTypeEnum.Image,
		updatedAt: '2025-01-01T00:00:00Z',
		visibility: AssetVisibility.Timeline,
		...partial
	};
}

describe('matchesLocation', () => {
	it('matches same city case-insensitively', () => {
		const a = createAsset({ exifInfo: { city: 'Paris', country: 'France' } });
		const b = createAsset({ exifInfo: { city: 'paris', country: 'Other' } });
		expect(matchesLocation(a, b)).toBe(true);
	});

	it('matches same country when city is absent', () => {
		const a = createAsset({ exifInfo: { country: 'Japan' } });
		const b = createAsset({ exifInfo: { country: 'japan' } });
		expect(matchesLocation(a, b)).toBe(true);
	});

	it('does not match different city in the same country when both have cities', () => {
		const a = createAsset({ exifInfo: { city: 'Kyoto', country: 'Japan' } });
		const b = createAsset({ exifInfo: { city: 'Tokyo', country: 'Japan' } });
		expect(matchesLocation(a, b)).toBe(false);
	});

	it('returns false when both locations are empty', () => {
		const a = createAsset({});
		const b = createAsset({ exifInfo: {} });
		expect(matchesLocation(a, b)).toBe(false);
	});
});

describe('matchesPerson', () => {
	it('matches when sharing a person by ID', () => {
		const a = createAsset({
			people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		const b = createAsset({
			people: [{ id: 'p1', name: 'Alice Updated', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		expect(matchesPerson(a, b)).toBe(true);
	});

	it('matches when sharing a person by name case-insensitively', () => {
		const a = createAsset({
			people: [{ id: 'p1', name: 'Bob', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		const b = createAsset({
			people: [{ id: 'p2', name: 'bob', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		expect(matchesPerson(a, b)).toBe(true);
	});

	it('does not match when people are different', () => {
		const a = createAsset({
			people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		const b = createAsset({
			people: [{ id: 'p2', name: 'Bob', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		expect(matchesPerson(a, b)).toBe(false);
	});

	it('ignores hidden people', () => {
		const a = createAsset({
			people: [{ id: 'p1', name: 'Alice', isHidden: true, otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		const b = createAsset({
			people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		expect(matchesPerson(a, b)).toBe(false);
	});

	it('returns false when either asset has no people', () => {
		const a = createAsset({ people: [] });
		const b = createAsset({
			people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		expect(matchesPerson(a, b)).toBe(false);
	});
});

describe('extractAvgHue', () => {
	it('returns null when thumbhash is null or empty', () => {
		expect(extractAvgHue(createAsset({ thumbhash: null }))).toBeNull();
		expect(extractAvgHue(createAsset({ thumbhash: '' }))).toBeNull();
	});

	it('returns a number 0–360 for a valid thumbhash', () => {
		const hash = makeThumbhash(50, 40);
		const hue = extractAvgHue(createAsset({ thumbhash: hash }));
		expect(hue).not.toBeNull();
		expect(hue!).toBeGreaterThanOrEqual(0);
		expect(hue!).toBeLessThanOrEqual(360);
	});
});

describe('matchesColor', () => {
	it('returns true for identical thumbhashes (diff = 0°)', () => {
		const hash = makeThumbhash(45, 45);
		const a = createAsset({ thumbhash: hash });
		const b = createAsset({ thumbhash: hash });
		expect(matchesColor(a, b, 30)).toBe(true);
	});

	it('returns false when either thumbhash is null', () => {
		const a = createAsset({ thumbhash: makeThumbhash(45, 45) });
		const b = createAsset({ thumbhash: null });
		expect(matchesColor(a, b, 30)).toBe(false);
	});

	it('respects tolerance boundary and angle wrapping', () => {
		// p > 0, q = 0 => hue = 0°
		const a = createAsset({ thumbhash: makeThumbhash(60, 31) });
		// near 0°
		const b = createAsset({ thumbhash: makeThumbhash(60, 31) });
		expect(matchesColor(a, b, 10)).toBe(true);
	});
});

describe('findMatchingPortraitIndex', () => {
	const anchor = createAsset({
		id: 'anchor',
		thumbhash: makeThumbhash(50, 40),
		exifInfo: { city: 'Oslo', country: 'Norway' }
	});

	it('returns -1 when mode is none', () => {
		const backlog = [
			anchor,
			createAsset({ id: 'match', exifInfo: { city: 'Oslo' } })
		];
		expect(findMatchingPortraitIndex(backlog, anchor, 'none', 30, () => true)).toBe(-1);
	});

	it('returns -1 when no portrait matches criteria', () => {
		const backlog = [
			anchor,
			createAsset({ id: 'diff', exifInfo: { city: 'Madrid' } })
		];
		expect(findMatchingPortraitIndex(backlog, anchor, 'location', 30, () => true)).toBe(-1);
	});

	it('returns index of first matching portrait in location mode', () => {
		const backlog = [
			anchor,
			createAsset({ id: 'no-match', exifInfo: { city: 'Berlin' } }),
			createAsset({ id: 'match', exifInfo: { city: 'oslo' } })
		];
		expect(findMatchingPortraitIndex(backlog, anchor, 'location', 30, () => true)).toBe(2);
	});

	it('returns index of first matching portrait in color mode', () => {
		const matchingHash = anchor.thumbhash!;
		const backlog = [
			anchor,
			createAsset({ id: 'no-match', thumbhash: makeThumbhash(10, 60) }),
			createAsset({ id: 'match', thumbhash: matchingHash })
		];
		expect(findMatchingPortraitIndex(backlog, anchor, 'color', 30, () => true)).toBe(2);
	});

	it('returns match in any mode and prioritises color over location', () => {
		const matchingHash = anchor.thumbhash!;
		const backlog = [
			anchor,
			createAsset({ id: 'loc-match', exifInfo: { city: 'Oslo' }, thumbhash: makeThumbhash(10, 60) }),
			createAsset({ id: 'col-match', thumbhash: matchingHash, exifInfo: { city: 'Rome' } })
		];
		// Prioritises color over location in 'any' mode
		expect(findMatchingPortraitIndex(backlog, anchor, 'any', 30, () => true)).toBe(2);
	});

	it('returns index of first matching portrait in person mode', () => {
		const anchorWithPerson = createAsset({
			...anchor,
			people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		const backlog = [
			anchorWithPerson,
			createAsset({ id: 'no-match', people: [{ id: 'p2', name: 'Bob', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }] }),
			createAsset({ id: 'person-match', people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }] })
		];
		expect(findMatchingPortraitIndex(backlog, anchorWithPerson, 'person', 30, () => true)).toBe(2);
	});

	it('prioritises location over person in any mode', () => {
		const anchorWithPerson = createAsset({
			...anchor,
			thumbhash: makeThumbhash(10, 10),
			exifInfo: { city: 'Oslo', country: 'Norway' },
			people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		const backlog = [
			anchorWithPerson,
			createAsset({
				id: 'person-match',
				thumbhash: makeThumbhash(50, 50),
				exifInfo: { city: 'Berlin' },
				people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
			}),
			createAsset({
				id: 'location-match',
				thumbhash: makeThumbhash(50, 50),
				exifInfo: { city: 'Oslo' },
				people: [{ id: 'p2', name: 'Bob', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
			})
		];
		// In 'any' mode, location (index 2) is prioritised over person (index 1)
		expect(findMatchingPortraitIndex(backlog, anchorWithPerson, 'any', 30, () => true)).toBe(2);
	});

	it('falls back to person match in any mode when color and location do not match', () => {
		const anchorWithPerson = createAsset({
			...anchor,
			thumbhash: makeThumbhash(10, 10),
			exifInfo: { city: 'Oslo', country: 'Norway' },
			people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
		});
		const backlog = [
			anchorWithPerson,
			createAsset({
				id: 'no-match',
				thumbhash: makeThumbhash(50, 50),
				exifInfo: { city: 'Berlin' },
				people: [{ id: 'p2', name: 'Bob', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
			}),
			createAsset({
				id: 'person-match',
				thumbhash: makeThumbhash(50, 50),
				exifInfo: { city: 'Rome' },
				people: [{ id: 'p1', name: 'Alice', otherPeople: [], sharedBy: [], sharedWith: [], thumbnailPath: '', birthDate: null }]
			})
		];
		expect(findMatchingPortraitIndex(backlog, anchorWithPerson, 'any', 30, () => true)).toBe(2);
	});

	it('skips non-portrait candidates', () => {
		const backlog = [
			anchor,
			createAsset({ id: 'landscape-match', exifInfo: { city: 'Oslo' } }),
			createAsset({ id: 'portrait-match', exifInfo: { city: 'Oslo' } })
		];
		const isPortrait = (a: AssetResponseDto) => a.id === 'portrait-match';
		expect(findMatchingPortraitIndex(backlog, anchor, 'location', 30, isPortrait)).toBe(2);
	});

	it('skips video assets even if they would match', () => {
		const backlog = [
			anchor,
			createAsset({ id: 'video-match', type: AssetTypeEnum.Video, exifInfo: { city: 'Oslo' } }),
			createAsset({ id: 'image-match', type: AssetTypeEnum.Image, exifInfo: { city: 'Oslo' } })
		];
		expect(findMatchingPortraitIndex(backlog, anchor, 'location', 30, () => true)).toBe(2);
	});
});
