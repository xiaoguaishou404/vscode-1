/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { IReadonlyTextBuffer, ITextModel } from 'vs/editor/common/model';
import { StandardTokenType } from 'vs/editor/common/modes';
import { Length, lengthToObj, toLength } from './length';

export interface Tokenizer {
	readonly offset: Length;
	readonly length: Length;

	read(): Token | undefined;
	peek(): Token | undefined;
	skip(length: Length): void;

	getText(): string;
}

export class TextBufferTokenizer implements Tokenizer {
	private readonly textBuffer: IReadonlyTextBuffer;
	private readonly textBufferLineCount: number;
	private readonly textBufferLastLineLength: number;

	constructor(
		private readonly textModel: ITextModel,
	) {
		this.textBufferLineCount = textModel.getLineCount();
		this.textBufferLastLineLength = textModel.getLineLength(this.textBufferLineCount);

		this.textBuffer = textModel.getTextBuffer();
	}

	private lineIdx = 0;
	private lineOffset = 0;
	private line: string | null = null;
	private lineTokens: LineTokens | null = null;

	get offset() {
		return toLength(this.lineIdx, this.lineOffset);
	}

	get length() {
		return toLength(this.textBufferLineCount, this.textBufferLastLineLength);
	}

	getText() {
		return this.textModel.getValue();
	}

	skip(length: Length): void {
		this.didPeek = false;
		const obj = lengthToObj(length);
		if (obj.lineCount === 0) {
			this.lineOffset += obj.columnCount;
		} else {
			this.lineIdx += obj.lineCount;
			this.lineOffset = obj.columnCount;
			this.line = this.textBuffer.getLineContent(this.lineIdx + 1);
			this.lineTokens = this.textModel.getLineTokens(this.lineIdx + 1);
		}
	}

	private increment(): boolean {
		this.lineOffset++;
		if (this.lineOffset > this.line!.length) {
			if (this.lineIdx === this.textBufferLineCount - 1) {
				return false;
			}
			this.lineOffset = 0;
			this.lineIdx++;
			this.line = this.textBuffer.getLineContent(this.lineIdx + 1);
			this.lineTokens = this.textModel.getLineTokens(this.lineIdx + 1);
		}
		return true;
	}

	private didPeek = false;
	private peeked: Token | undefined = undefined;
	private lineIdxAfterPeek = 0;
	private lineOffsetAfterPeek = 0;

	read(): Token | undefined {
		if (this.didPeek) {
			this.didPeek = false;
			this.lineIdx = this.lineIdxAfterPeek;
			this.lineOffset = this.lineOffsetAfterPeek;
			return this.peeked;
		}

		if (this.lineIdx > this.textBufferLineCount - 1 || (this.lineIdx === this.textBufferLineCount - 1 && this.lineOffset >= this.textBufferLastLineLength)) {
			return undefined;
		}

		if (this.line === null) {
			this.line = this.textBuffer.getLineContent(this.lineIdx + 1);
			this.lineTokens = this.textModel.getLineTokens(this.lineIdx + 1);
		}

		const brackets = new Set(['{', '}', '(', ')', '[', ']']);

		const curLine = this.lineIdx;
		const curLineOffset = this.lineOffset;

		const text = this.line[this.lineOffset];
		let shouldContinue = this.increment();

		const tokenIdx = this.lineTokens!.findTokenIndexAtOffset(this.lineOffset);
		const isOther = this.lineTokens!.getStandardTokenType(tokenIdx) === StandardTokenType.Other;

		if (brackets.has(text) && isOther) {
			let category = 0;
			if (text === '[' || text === ']') {
				category = 1;
			} else if (text === '(' || text === ')') {
				category = 2;
			} else if (text === '{' || text === '}') {
				category = 3;
			}

			const length = (curLine !== this.lineIdx)
				? toLength(this.lineIdx - curLine, this.lineOffset)
				: toLength(0, this.lineOffset - curLineOffset);

			if (text === '[' || text === '{' || text === '(') {
				return new Token(length, TokenKind.OpeningBracket, category);
			}
			if (text === ']' || text === '}' || text === ')') {
				return new Token(length, TokenKind.ClosingBracket, category);
			}
			throw new Error('unexpected');
		} else {
			let i = 1000;
			while (
				i > 0 && shouldContinue &&
				!brackets.has(this.line[this.lineOffset])
			) {
				i--;
				shouldContinue = this.increment();
			}

			const length = (curLine !== this.lineIdx)
				? toLength(this.lineIdx - curLine, this.lineOffset)
				: toLength(0, this.lineOffset - curLineOffset);

			return new Token(length, TokenKind.Text, -1);
		}
	}

	peek(): Token | undefined {
		if (this.didPeek) {
			return this.peeked;
		}

		const lineIdx = this.lineIdx;
		const lineOffset = this.lineOffset;

		const t = this.read();
		this.didPeek = true;
		this.peeked = t;

		this.lineIdxAfterPeek = this.lineIdx;
		this.lineOffsetAfterPeek = this.lineOffset;
		this.lineIdx = lineIdx;
		this.lineOffset = lineOffset;

		return t;
	}
}

export const enum TokenKind {
	Text = 0,
	OpeningBracket = 1,
	ClosingBracket = 2,
}

export class Token {
	constructor(
		readonly length: Length,
		readonly kind: TokenKind,
		readonly category: number
	) { }
}
