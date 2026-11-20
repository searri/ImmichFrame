import type { AssetResponseDto } from '$lib/immichFrameApi';
import { isImageAsset } from '$lib/constants/asset-type';

/**
 * Returns an approximate dominant hue (0–360°) decoded from ThumbHash bytes, or null.
 *
 * ThumbHash layout (see https://evanw.github.io/thumbhash/):
 *   byte[0] bits 0-5 : l_dc  (quantised luma DC)
 *   byte[0] bits 6-7 + byte[1] bits 0-2 : p_dc  (Cb-like chrominance, 5 bits total)
 *   byte[1] bits 3-7 : q_dc  (Cr-like chrominance, 5 bits)
 *
 * p and q are decoded to –1..1 and atan2(q, p) gives an approximate hue angle.
 */
export function extractAvgHue(asset: AssetResponseDto): number | null {
	if (!asset.thumbhash) return null;
	try {
		const bytes = Uint8Array.from(atob(asset.thumbhash), (c) => c.charCodeAt(0));
		if (bytes.length < 3) return null;
		const header24 = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
		const p_raw = (header24 >> 6) & 63;
		const q_raw = (header24 >> 12) & 63;
		const p = p_raw / 31.5 - 1.0;
		const q = q_raw / 31.5 - 1.0;
		return ((Math.atan2(q, p) * 180) / Math.PI + 360) % 360;
	} catch {
		return null;
	}
}

/** True if assets share the same city (preferred) or same country. */
export function matchesLocation(a: AssetResponseDto, b: AssetResponseDto): boolean {
	const norm = (s?: string | null) => s?.trim().toLowerCase() || '';
	const ca = norm(a.exifInfo?.city);
	const cb = norm(b.exifInfo?.city);
	if (ca && cb && ca === cb) return true;
	const ra = norm(a.exifInfo?.country);
	const rb = norm(b.exifInfo?.country);
	return !!(ra && rb && ra === rb);
}

/** True if assets share at least one person. */
export function matchesPerson(a: AssetResponseDto, b: AssetResponseDto): boolean {
	const aPeople = a.people?.filter((p) => !p.isHidden && (p.id || p.name)) ?? [];
	const bPeople = b.people?.filter((p) => !p.isHidden && (p.id || p.name)) ?? [];
	if (!aPeople.length || !bPeople.length) return false;

	const aIdentifiers = new Set<string>();
	for (const p of aPeople) {
		if (p.id) aIdentifiers.add(p.id);
		if (p.name) aIdentifiers.add(p.name.trim().toLowerCase());
	}

	return bPeople.some((p) => {
		if (p.id && aIdentifiers.has(p.id)) return true;
		if (p.name && aIdentifiers.has(p.name.trim().toLowerCase())) return true;
		return false;
	});
}

/**
 * True if assets have a similar dominant hue within `toleranceDeg` degrees.
 * The comparison wraps around the 360° circle so red hues at 0° and 359° match.
 */
export function matchesColor(
	a: AssetResponseDto,
	b: AssetResponseDto,
	toleranceDeg = 30
): boolean {
	const ha = extractAvgHue(a);
	const hb = extractAvgHue(b);
	if (ha === null || hb === null) return false;
	const diff = Math.abs(ha - hb);
	return Math.min(diff, 360 - diff) <= toleranceDeg;
}

export type MatchMode = 'none' | 'location' | 'color' | 'person' | 'any';

/**
 * Scans `backlog[1..]` for the first portrait image that matches `anchor`
 * under the given mode. Returns its index, or -1 if none is found.
 *
 * Priority when mode === 'any': color -> location -> person.
 *
 * @param isPortrait  Injected so this module stays free of Svelte store reads.
 */
export function findMatchingPortraitIndex(
	backlog: AssetResponseDto[],
	anchor: AssetResponseDto,
	mode: MatchMode = 'none',
	colorTolerance = 30,
	isPortrait: (a: AssetResponseDto) => boolean
): number {
	if (mode === 'none') return -1;

	// When mode is 'any', priority order is: color -> location -> person.
	if (mode === 'any') {
		// Pass 1 — color
		for (let i = 1; i < backlog.length; i++) {
			const c = backlog[i];
			if (!isPortrait(c) || !isImageAsset(c)) continue;
			if (matchesColor(anchor, c, colorTolerance)) return i;
		}
		// Pass 2 — location
		for (let i = 1; i < backlog.length; i++) {
			const c = backlog[i];
			if (!isPortrait(c) || !isImageAsset(c)) continue;
			if (matchesLocation(anchor, c)) return i;
		}
		// Pass 3 — person
		for (let i = 1; i < backlog.length; i++) {
			const c = backlog[i];
			if (!isPortrait(c) || !isImageAsset(c)) continue;
			if (matchesPerson(anchor, c)) return i;
		}
		return -1;
	}

	// Single-criterion modes
	for (let i = 1; i < backlog.length; i++) {
		const c = backlog[i];
		if (!isPortrait(c) || !isImageAsset(c)) continue;
		let matches = false;
		if (mode === 'location') {
			matches = matchesLocation(anchor, c);
		} else if (mode === 'color') {
			matches = matchesColor(anchor, c, colorTolerance);
		} else if (mode === 'person') {
			matches = matchesPerson(anchor, c);
		}
		if (matches) return i;
	}
	return -1;
}
