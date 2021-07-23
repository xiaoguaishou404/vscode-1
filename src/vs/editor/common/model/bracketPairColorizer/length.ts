/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLines } from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class LengthObj {
	public static zero = new LengthObj(0, 0);

	public static lengthDiffNonNeg(start: LengthObj, end: LengthObj): LengthObj {
		if (end.isLessThan(start)) {
			return LengthObj.zero;
		}
		if (start.lineCount === end.lineCount) {
			return new LengthObj(0, end.columnCount - start.columnCount);
		} else {
			return new LengthObj(end.lineCount - start.lineCount, end.columnCount);
		}
	}

	constructor(
		public readonly lineCount: number,
		public readonly columnCount: number
	) { }

	public isZero() {
		return this.lineCount === 0 && this.columnCount === 0;
	}

	public toLength(): Length {
		return toLength(this.lineCount, this.columnCount);
	}

	public isLessThan(other: LengthObj): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount < other.lineCount;
		}
		return this.columnCount < other.columnCount;
	}

	public isGreaterThan(other: LengthObj): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount > other.lineCount;
		}
		return this.columnCount > other.columnCount;
	}

	public equals(other: LengthObj): boolean {
		return this.lineCount === other.lineCount && this.columnCount === other.columnCount;
	}

	public compare(other: LengthObj): number {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount - other.lineCount;
		}
		return this.columnCount - other.columnCount;
	}

	public add(other: LengthObj): LengthObj {
		if (other.lineCount === 0) {
			return new LengthObj(this.lineCount, this.columnCount + other.columnCount);
		} else {
			return new LengthObj(this.lineCount + other.lineCount, other.columnCount);
		}
	}

	toString() {
		return `${this.lineCount},${this.columnCount}`;
	}
}


// ========= This is the fast implementation, but it is very hard to debug =========
// /* // Uncomment to enable the slow implementation that makes debugging significantly easier (objects are used instead of a number enconding).

export type Length = { _brand: 'Length' };

export const lengthZero = 0 as any as Length;

export function lengthIsZero(length: Length): boolean {
	return length as any as number === 0;
}

const factor = 2 ** 26;

export function lengthAdd(length1: Length, length2: Length): Length {
	const l1 = length1 as any as number;
	const lineCount1 = Math.floor(l1 / factor);

	const l2 = length2 as any as number;
	const lineCount2 = Math.floor(l2 / factor);
	const colCount2 = l2 - lineCount2 * factor;

	if (lineCount2 === 0) {
		const colCount1 = l1 - lineCount1 * factor;
		return toLength(lineCount1, colCount1 + colCount2);
	}
	return toLength(lineCount1 + lineCount2, colCount2);
}

// Returns a non negative length `result` such that `lengthAdd(length1, result) = length2`, or zero if such length does not exist.
export function lengthDiffNonNeg(length1: Length, length2: Length): Length {
	const l1 = length1 as any as number;
	const l2 = length2 as any as number;

	const diff = l2 - l1;
	if (diff <= 0) {
		// line-count of length1 is higher than line-count of length2
		// or they are equal and column-count of length1 is higher than column-count of length2
		return lengthZero;
	}

	const lineCount1 = Math.floor(l1 / factor);
	const lineCount2 = Math.floor(l2 / factor);

	const colCount2 = l2 - lineCount2 * factor;

	if (lineCount1 === lineCount2) {
		const colCount1 = l1 - lineCount1 * factor;
		return toLength(0, colCount2 - colCount1);
	} else {
		return toLength(lineCount2 - lineCount1, colCount2);
	}
}

export function toLength(lineCount: number, columnCount: number): Length {
	return (lineCount * factor + columnCount) as any as Length;
}

export function lengthLessThan(length1: Length, length2: Length): boolean {
	// First, compare line counts, then column counts.
	return (length1 as any as number) < (length2 as any as number);
}

export function lengthLessThanEqual(length1: Length, length2: Length): boolean {
	return (length1 as any as number) <= (length2 as any as number);
}

export function lengthGreaterThanEqual(length1: Length, length2: Length): boolean {
	return (length1 as any as number) >= (length2 as any as number);
}

export function lengthToPosition(length: Length): Position {
	const l = length as any as number;
	const lineCount = Math.floor(l / factor);
	const colCount = l - lineCount * factor;
	return new Position(lineCount + 1, colCount + 1);
}

export function positionToLength(position: Position): Length {
	return toLength(position.lineNumber - 1, position.column - 1);
}

export function lengthsToRange(lengthStart: Length, lengthEnd: Length): Range {
	const l = lengthStart as any as number;
	const lineCount = Math.floor(l / factor);
	const colCount = l - lineCount * factor;

	const l2 = lengthEnd as any as number;
	const lineCount2 = Math.floor(l2 / factor);
	const colCount2 = l2 - lineCount2 * factor;

	return new Range(lineCount + 1, colCount + 1, lineCount2 + 1, colCount2 + 1);
}

export function lengthToObj(length: Length): LengthObj {
	const l = length as any as number;
	const lineCount = Math.floor(l / factor);
	const columnCount = l - lineCount * factor;
	return new LengthObj(lineCount, columnCount);
}

export function compareLengths(length1: Length, length2: Length): number {
	const l1 = length1 as any as number;
	const l2 = length2 as any as number;
	return l1 - l2;
}

export function lengthOfString(str: string): Length {
	const lines = splitLines(str);
	return toLength(lines.length - 1, lines[lines.length - 1].length);
}

export function lengthOfStringObj(str: string): LengthObj {
	const lines = splitLines(str);
	return new LengthObj(lines.length - 1, lines[lines.length - 1].length);
}

/*/

// ========= This is a slow implementation, but much easier to debug =========

export type Length = LengthObj;

export const lengthZero = LengthObj.zero;

export function lengthIsZero(length: Length): boolean {
	return length.isZero();
}

export function lengthAdd(length1: Length, length2: Length): Length {
	return length1.add(length2);
}


// Returns a non negative length `result` such that `lengthAdd(length1, result) = length2`, or zero if such length does not exist.
export function lengthDiffNonNeg(length1: Length, length2: Length): Length {
	return LengthObj.lengthDiffNonNeg(length1, length2);
}

export function toLength(lineCount: number, columnCount: number): Length {
	return new LengthObj(lineCount, columnCount);
}

export function lengthLessThan(length1: Length, length2: Length): boolean {
	return length1.isLessThan(length2);
}

export function lengthLessThanEqual(length1: Length, length2: Length): boolean {
	return !length1.isGreaterThan(length2);
}

export function lengthGreaterThanEqual(length1: Length, length2: Length): boolean {
	return !length1.isLessThan(length2);
}

export function lengthToPosition(length: Length): Position {
	return new Position(length.lineCount + 1, length.columnCount + 1);
}

export function lengthsToRange(lengthStart: Length, lengthEnd: Length): Range {
	return new Range(lengthStart.lineCount + 1, lengthStart.columnCount + 1, lengthEnd.lineCount + 1, lengthEnd.columnCount + 1);
}

export function positionToLength(position: Position): Length {
	return toLength(position.lineNumber - 1, position.column - 1);
}

export function lengthToObj(length: Length): LengthObj {
	return length;
}

export function compareLengths(length1: Length, length2: Length): number {
	return length1.compare(length2);
}

export function lengthOfString(str: string): Length {
	const lines = splitLines(str);
	return toLength(lines.length - 1, lines[lines.length - 1].length);
}

export function lengthOfStringObj(str: string): LengthObj {
	const lines = splitLines(str);
	return new LengthObj(lines.length - 1, lines[lines.length - 1].length);
}

// */
