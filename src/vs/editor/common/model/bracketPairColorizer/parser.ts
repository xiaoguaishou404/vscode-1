/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AstNode, AstNodeKind, BracketAstNode, InvalidBracketAstNode, ListAstNode, PairAstNode, TextAstNode } from './ast';
import { BeforeEditPositionMapper, TextEdit } from './beforeEditPositionMapper';
import { lengthAdd, lengthIsZero, lengthLessThanEqual, lengthZero, toLength } from './length';
import { merge23Trees } from './mergeItems';
import { NodeReader } from './nodeReader';
import { Tokenizer, Token, TokenKind } from './tokenizer';

export function parseDocument(tokenizer: Tokenizer, edits: TextEdit[], oldNode: AstNode | undefined): AstNode {
	const parser = new Parser(tokenizer, edits, oldNode);
	return parser.parseDocument();
}

export class Parser {
	private readonly oldNodeReader?: NodeReader;
	private readonly positionMapper: BeforeEditPositionMapper;

	constructor(
		private readonly tokenizer: Tokenizer,
		edits: TextEdit[],
		oldNode: AstNode | undefined
	) {
		this.oldNodeReader = oldNode ? new NodeReader(oldNode) : undefined;
		this.positionMapper = new BeforeEditPositionMapper(edits, tokenizer.length);
	}

	parseDocument(): AstNode {
		let result = this.parseList(new Set());
		if (!result) {
			result = new ListAstNode([]);
		}
		(result as any).src = this.tokenizer.getText();
		return result;
	}

	private parseList(
		expectedClosingCategories: Set<number>,
	): AstNode | null {
		const items = new Array<AstNode>();

		while (true) {
			const token = this.tokenizer.peek();
			if (
				!token ||
				(token.kind === TokenKind.ClosingBracket &&
					expectedClosingCategories.has(token.category))
			) {
				break;
			}

			const child = this.parseChild(expectedClosingCategories);
			if (child.kind === AstNodeKind.List && child.children.length === 0) {
				continue;
			}

			items.push(child);
		}

		// Root nodes &  always have dependencyLength = length + 1
		const result = merge23Trees(items);
		return result;
	}

	private parseChild(
		expectingClosingCategories: Set<number>,
	): AstNode {
		if (this.oldNodeReader) {
			const maxCacheableLength = this.positionMapper.getDistanceToNextChange(this.tokenizer.offset);
			if (!lengthIsZero(maxCacheableLength)) {
				const cachedNode = this.oldNodeReader.readLongestNodeAt(this.positionMapper.getOffsetBeforeChange(this.tokenizer.offset), curNode => {
					if (!lengthLessThanEqual(curNode.length, maxCacheableLength)) {
						return false;
					}

					// TODO check conditions
					const canBeReused = curNode.canBeReused(
						() => new Token(toLength(0, 1), TokenKind.Text, 0),
						new Set()
					);
					return canBeReused;
				});

				if (cachedNode) {
					this.tokenizer.skip(cachedNode.length);
					return cachedNode;
				}
			}
		}

		const token = this.tokenizer.read()!;

		if (token.kind === TokenKind.ClosingBracket) {
			return new InvalidBracketAstNode(token.length);
		}

		if (token.kind === TokenKind.Text) {
			return new TextAstNode(token.length);
		}
		if (token.kind === TokenKind.OpeningBracket) {
			const hadCategory = expectingClosingCategories.has(token.category);
			if (!hadCategory) {
				expectingClosingCategories.add(token.category);
			}
			const child = this.parseList(expectingClosingCategories);
			if (!hadCategory) {
				expectingClosingCategories.delete(token.category);
			}

			const nextToken = this.tokenizer.peek();
			const childLength = child?.length || lengthZero;
			if (
				nextToken &&
				nextToken.kind === TokenKind.ClosingBracket &&
				nextToken.category === token.category
			) {
				this.tokenizer.read();
				return new PairAstNode(
					lengthAdd(lengthAdd(token.length, childLength), nextToken.length),
					token.category,
					new BracketAstNode(token.length),
					child,
					new BracketAstNode(nextToken.length)
				);
			} else {
				return new PairAstNode(
					lengthAdd(token.length, childLength),
					token.category,
					new BracketAstNode(token.length),
					child,
					null
				);
			}
		}

		throw new Error('unexpected');
	}
}
