/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { DecorationProvider } from 'vs/editor/common/model/DecorationSource';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IModelContentChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { AstNode, AstNodeKind } from './ast';
import { TextEdit } from './beforeEditPositionMapper';
import { Length, lengthAdd, lengthGreaterThanEqual, lengthLessThanEqual, lengthOfString, lengthsToRange, lengthZero, positionToLength, toLength } from './length';
import { parseDocument } from './parser';
import { TextBufferTokenizer } from './tokenizer';

export class BracketPairColorizer implements DecorationProvider {
	private readonly didChangeDecorationsEmitter = new Emitter<void>();

	private currentAst: AstNode;

	constructor(private readonly textModel: TextModel) {
		textModel.onDidChangeTokens1(({ ranges }) => {
			this.handleEdits(
				ranges.map(r =>
					new TextEdit(
						toLength(r.fromLineNumber - 1, 0),
						toLength(r.toLineNumber, 0),
						toLength(r.toLineNumber - r.fromLineNumber + 1, 0)
					)
				)
			);
			this.didChangeDecorationsEmitter.fire();
		});
		this.currentAst = this.parseDocumentFromTextBuffer([], undefined);
	}

	handleContentChanged(change: IModelContentChangedEvent) {
		this.handleEdits(
			change.changes.map(c => {
				const range = Range.lift(c.range);
				return new TextEdit(
					positionToLength(range.getStartPosition()),
					positionToLength(range.getEndPosition()),
					lengthOfString(c.text)
				);
			}).reverse()
		);
	}

	private handleEdits(edits: TextEdit[]): void {
		this.currentAst = this.parseDocumentFromTextBuffer(
			edits,
			this.currentAst
		);
	}

	/**
	 * @pure (only if isPure = true)
	*/
	private parseDocumentFromTextBuffer(edits: TextEdit[], previousAst: AstNode | undefined): AstNode {
		/*
		const reader1 = new TextBufferReader(this.textModel, edits);

		const tokens = new Array<Token>();
		let token: Token | undefined;
		while ((token = reader1.read()) !== undefined) {
			tokens.push(token);
		}
		*/

		// Is much faster if `isPure = false`.
		const isPure = false;
		const previousAstClone = isPure ? previousAst?.clone() : previousAst;
		const tokenizer = new TextBufferTokenizer(this.textModel);
		const result = parseDocument(tokenizer, edits, previousAstClone);
		return result;
	}

	getBracketsInRange(range: Range): BracketInfo[] {
		/*const buffer = this.textModel.getTextBuffer();

		const startOffset = buffer.getOffsetAt(range.startLineNumber, range.startColumn);
		const value = buffer.getValueInRange(range, EndOfLinePreference.TextDefined);

		const regexp = /[{}()\[\]]/g;

		const result: BracketInfo[] = [];
		let match: RegExpExecArray | null;
		while ((match = regexp.exec(value)) !== null) {
			const range = Range.fromPositions(
				buffer.getPositionAt(startOffset + match.index),
				buffer.getPositionAt(startOffset + match.index + match[0].length)
			);

			result.push(new BracketInfo(range, 0));
		}

		return result;*/

		const startOffset = toLength(range.startLineNumber - 1, range.startColumn - 1);
		const endOffset = toLength(range.endLineNumber - 1, range.endColumn - 1);
		const result = new Array<BracketInfo>();
		collectBrackets(this.currentAst, lengthZero, this.currentAst.length, startOffset, endOffset, 0, result);
		return result;
	}

	getLineDecorations(lineNumber: number, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		const maxColumn = this.textModel.getLineMaxColumn(lineNumber);
		return this.getDecorationsInRange(new Range(lineNumber, 1, lineNumber, maxColumn), ownerId, filterOutValidation);
	}
	getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		const result = new Array<IModelDecoration>();
		const bracketsInRange = this.getBracketsInRange(range);
		/*if (bracketsInRange.length > 1000) {
			return [];
		}*/

		for (const bracket of bracketsInRange) {
			/*if (!range.intersectRanges(bracket.range)) {
				continue;
			}*/
			result.push({
				id: `bracket${bracket.range.toString()}-${bracket.level}`,
				options: { description: 'foo', inlineClassName: `lvl${bracket.level % 5}` },
				ownerId: 0,
				range: bracket.range
			});
		}
		return result;
	}
	getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		return this.getDecorationsInRange(new Range(1, 1, this.textModel.getLineCount(), 1), ownerId, filterOutValidation);
	}

	readonly onDidChangeDecorations = this.didChangeDecorationsEmitter.event;
}

function collectBrackets(node: AstNode, nodeOffsetStart: Length, nodeOffsetEnd: Length, startOffset: Length, endOffset: Length, level: number, result: BracketInfo[]) {
	if (node.kind === AstNodeKind.Bracket) {
		const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
		result.push(new BracketInfo(range, level));
	}
	else {
		if (node.kind === AstNodeKind.Pair) {
			level++;
		}
		for (const child of node.children) {
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (lengthLessThanEqual(nodeOffsetStart, endOffset) && lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
				collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, level, result);
			}
			nodeOffsetStart = nodeOffsetEnd;
		}
	}
}

export class BracketInfo {
	constructor(public readonly range: Range, public readonly level: number) { }
}

registerThemingParticipant((theme, collector) => {
	collector.addRule(`.monaco-editor .lvl0 { color: yellow; }`);
	collector.addRule(`.monaco-editor .lvl1 { color: red; }`);
	collector.addRule(`.monaco-editor .lvl2 { color: green; }`);
	collector.addRule(`.monaco-editor .lvl3 { color: blue; }`);
	collector.addRule(`.monaco-editor .lvl4 { color: orange; }`);
});
