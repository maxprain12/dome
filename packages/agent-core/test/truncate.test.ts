import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	truncateLine,
	truncateTail,
} from '../src/harness/utils/truncate.js';

describe('formatSize', () => {
	it('formats bytes, KB, and MB', () => {
		expect(formatSize(512)).toBe('512B');
		expect(formatSize(1536)).toBe('1.5KB');
		expect(formatSize(2 * 1024 * 1024)).toBe('2.0MB');
	});
});

describe('truncateHead', () => {
	it('returns content unchanged when under limits', () => {
		const content = 'a\nb\nc';
		const r = truncateHead(content, { maxLines: 10, maxBytes: 1000 });
		expect(r.truncated).toBe(false);
		expect(r.content).toBe(content);
		expect(r.truncatedBy).toBeNull();
	});

	it('truncates by line limit without partial lines', () => {
		const content = Array.from({ length: 20 }, (_, i) => `L${i}`).join('\n');
		const r = truncateHead(content, { maxLines: 5, maxBytes: 10_000 });
		expect(r.truncated).toBe(true);
		expect(r.truncatedBy).toBe('lines');
		expect(r.content.split('\n')).toHaveLength(5);
		expect(r.content).toBe('L0\nL1\nL2\nL3\nL4');
	});

	it('returns empty when first line alone exceeds byte limit', () => {
		const content = `${'x'.repeat(100)}\nsecond`;
		const r = truncateHead(content, { maxLines: 10, maxBytes: 10 });
		expect(r.truncated).toBe(true);
		expect(r.truncatedBy).toBe('bytes');
		expect(r.content).toBe('');
		expect(r.firstLineExceedsLimit).toBe(true);
		expect(r.outputLines).toBe(0);
	});

	it('stops on byte limit at a line boundary', () => {
		const content = 'aaaa\nbbbb\ncccc';
		// "aaaa" = 4; next line needs +1 newline + 4 = 9 → exceeds maxBytes 8
		const r = truncateHead(content, { maxLines: 10, maxBytes: 8 });
		expect(r.truncated).toBe(true);
		expect(r.truncatedBy).toBe('bytes');
		expect(r.content).toBe('aaaa');
		expect(r.lastLinePartial).toBe(false);
	});
});

describe('truncateTail', () => {
	it('keeps the end when line-limited', () => {
		const content = `${Array.from({ length: 100 }, (_, i) => `L${i}`).join('\n')}\nTAIL`;
		const r = truncateTail(content, { maxLines: 5, maxBytes: 10_000 });
		expect(r.truncated).toBe(true);
		expect(r.content).toMatch(/TAIL$/);
		expect(r.content.split('\n').length).toBeLessThanOrEqual(5);
	});

	it('partially keeps the end of a single oversize line (ASCII)', () => {
		const content = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		const r = truncateTail(content, { maxLines: 10, maxBytes: 5 });
		expect(r.truncated).toBe(true);
		expect(r.truncatedBy).toBe('bytes');
		expect(r.lastLinePartial).toBe(true);
		expect(r.content).toBe('VWXYZ');
		expect(Buffer.byteLength(r.content, 'utf8')).toBe(5);
	});

	it('never splits a multi-byte UTF-8 character when truncating from the end', () => {
		// "é" is 2 bytes; emoji 😀 is 4 bytes
		const content = `prefix-${'é'.repeat(10)}-😀-suffix`;
		const r = truncateTail(content, { maxLines: 5, maxBytes: 12 });
		expect(r.truncated).toBe(true);
		expect(r.lastLinePartial).toBe(true);
		expect(Buffer.byteLength(r.content, 'utf8')).toBeLessThanOrEqual(12);
		// Re-encoding must be valid UTF-8 (no replacement from mid-sequence)
		expect(Buffer.from(r.content, 'utf8').toString('utf8')).toBe(r.content);
		expect(r.content.endsWith('suffix')).toBe(true);
	});

	it('replaces unpaired surrogates included in the kept suffix', () => {
		const loneLow = String.fromCharCode(0xdc00);
		const content = `keep${loneLow}END`;
		const r = truncateTail(content, { maxLines: 5, maxBytes: 20 });
		expect(r.truncated).toBe(false);
		expect(r.content).toContain('END');
		// Under limits → original returned as-is (no replacement path)
		expect(r.content).toBe(content);

		const oversize = `${'A'.repeat(30)}${loneLow}END`;
		const truncated = truncateTail(oversize, { maxLines: 5, maxBytes: 8 });
		expect(truncated.truncated).toBe(true);
		expect(truncated.lastLinePartial).toBe(true);
		expect(truncated.content).toContain('END');
		expect(truncated.content).toContain('\uFFFD');
		expect(truncated.content).not.toContain(loneLow);
	});

	it('returns empty string when maxBytes is 0 on an oversize single line', () => {
		const r = truncateTail('hello', { maxLines: 10, maxBytes: 0 });
		expect(r.truncated).toBe(true);
		expect(r.content).toBe('');
		expect(r.lastLinePartial).toBe(true);
	});
});

describe('truncateLine', () => {
	it('leaves short lines alone and suffixes long ones', () => {
		expect(truncateLine('short', 20)).toEqual({ text: 'short', wasTruncated: false });
		expect(truncateLine('abcdefghijklmnopqrstuvwxyz', 10)).toEqual({
			text: 'abcdefghij... [truncated]',
			wasTruncated: true,
		});
	});
});

describe('defaults', () => {
	it('exports expected default limits', () => {
		expect(DEFAULT_MAX_LINES).toBe(2000);
		expect(DEFAULT_MAX_BYTES).toBe(50 * 1024);
	});
});
