/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lengthAdd, lengthZero, Length } from './length';
import { Token } from './tokenizer';

export const enum AstNodeKind {
	Text = 0,
	Bracket = 1,
	Pair = 2,
	UnexpectedClosingBracket = 3,
	List = 4,
}

export type AstNode = PairAstNode | ListAstNode | BracketAstNode | InvalidBracketAstNode | TextAstNode;

abstract class BaseAstNode {
	abstract readonly kind: AstNodeKind;
	abstract readonly children: readonly AstNode[];

	/**
	 * In case of a list, determines the height of the (2,3) tree.
	*/
	abstract readonly listHeight: number;

	abstract canBeReused(
		peekTokenAfterNode: () => Token,
		expectedClosingCategories: Set<number>
	): boolean;

	/**
	 * Flattenes all lists in this AST. Only for debugging.
	 */
	abstract normalizeLists(): AstNode;

	/**
	 * Creates a deep clone. Only for debugging.
	 */
	abstract clone(): AstNode;

	protected _length: Length;

	get length(): Length {
		return this._length;
	}

	constructor(length: Length) {
		this._length = length;
	}
}

export class PairAstNode extends BaseAstNode {
	public readonly children: readonly AstNode[];
	get kind(): AstNodeKind.Pair {
		return AstNodeKind.Pair;
	}
	get listHeight() {
		return 0;
	}

	canBeReused(
		getTokenAfterNode: () => Token,
		expectedClosingCategories: Set<number>
	) {
		if (this.closingBracket === null) {
			return false;

			/*
			// TODO
			const tokenAfterNode = getTokenAfterNode();
			if (tokenAfterNode.kind === TokenKind.ClosingBracket &&
				tokenAfterNode.category === this.category) {
				// The next token used to be different.
				return false;
			}
			*/
		}

		// TODO expectedClosingCategories
		return true;
	}

	normalizeLists(): PairAstNode {
		return new PairAstNode(
			this.length,
			this.category,
			this.openingBracket.normalizeLists(),
			this.child && this.child.normalizeLists(),
			this.closingBracket && this.closingBracket.normalizeLists()
		);
	}

	constructor(
		length: Length,
		public readonly category: number,
		public readonly openingBracket: BracketAstNode,
		public readonly child: AstNode | null,
		public readonly closingBracket: BracketAstNode | null
	) {
		super(length);

		this.children = [this.openingBracket, this.child, this.closingBracket].filter(
			(n) => !!n
		) as AstNode[];
	}

	clone(): PairAstNode {
		return new PairAstNode(
			this.length,
			this.category,
			this.openingBracket && this.openingBracket.clone(),
			this.child && this.child.clone(),
			this.closingBracket && this.closingBracket.clone()
		);
	}
}

export class ListAstNode extends BaseAstNode {
	get kind(): AstNodeKind.List {
		return AstNodeKind.List;
	}
	get children(): readonly AstNode[] {
		return this._items;
	}

	readonly listHeight: number;

	constructor(private readonly _items: AstNode[]) {
		super(_items.reduce((a, b) => lengthAdd(a, b.length), lengthZero));

		if (_items.length > 0) {
			this.listHeight = _items[0].listHeight + 1;
		} else {
			this.listHeight = 0;
		}
	}

	canBeReused(
		getTokenAfterNode: () => Token,
		expectedClosingCategories: Set<number>
	): boolean {
		// TODO expectedClosingCategories
		if (this._items.length === 0) {
			// might not be very helpful
			return true;
		}

		let lastChild = this.children[this.children.length - 1];
		while (lastChild.kind === AstNodeKind.List) {
			lastChild = lastChild.children[lastChild.children.length - 1];
		}

		return lastChild.canBeReused(
			getTokenAfterNode,
			expectedClosingCategories
		);
	}

	normalizeLists(): ListAstNode {
		const items = new Array<AstNode>();
		for (const c of this.children) {
			const normalized = c.normalizeLists();
			if (normalized.kind === AstNodeKind.List) {
				items.push(...normalized._items);
			} else {
				items.push(normalized);
			}
		}
		return new ListAstNode(items);
	}

	clone(): ListAstNode {
		return new ListAstNode(this._items.map(c => c.clone()));
	}

	private updateLength(): void {
		this._length = this._items.reduce((a, b) => lengthAdd(a, b.length), lengthZero);
	}

	/**
	 * Appends the given node to the end of this (2,3) tree.
	 * Returns the new root.
	*/
	append(nodeToAppend: AstNode): AstNode {
		const newNode = this._append(nodeToAppend);
		if (newNode) {
			return new ListAstNode([this, newNode]);
		}
		return this;
	}

	/**
	 * @returns Additional node after tree
	*/
	private _append(nodeToAppend: AstNode): AstNode | undefined {
		// assert nodeToInsert.listHeight <= tree.listHeight

		if (nodeToAppend.listHeight === this.listHeight) {
			return nodeToAppend;
		}

		const lastItem = this._items[this._items.length - 1];
		const newNodeAfter = (lastItem.kind === AstNodeKind.List) ? lastItem._append(nodeToAppend) : nodeToAppend;

		if (!newNodeAfter) {
			this.updateLength();
			return undefined;
		}

		// Can we take the element?
		if (this._items.length >= 3) {
			// assert tree.items.length === 3

			// we need to split to maintain (2,3)-tree property.
			// Send the third element + the new element to the parent.
			const third = this._items.pop()!;
			this.updateLength();
			return new ListAstNode([third, newNodeAfter]);
		} else {
			this._items.push(newNodeAfter);
			this.updateLength();
			return undefined;
		}
	}

	/**
	 * Prepends the given node to the end of this (2,3) tree.
	 * Returns the new root.
	*/
	prepend(nodeToPrepend: AstNode): AstNode {
		const newNode = this._prepend(nodeToPrepend);
		if (newNode) {
			return new ListAstNode([newNode, this]);
		}
		return this;
	}

	/**
	 * @returns Additional node before tree
	*/
	private _prepend(nodeToPrepend: AstNode): AstNode | undefined {
		// assert nodeToInsert.listHeight <= tree.listHeight

		if (nodeToPrepend.listHeight === this.listHeight) {
			return nodeToPrepend;
		}

		if (this.kind !== AstNodeKind.List) {
			throw new Error('unexpected');
		}

		const first = this._items[0];
		const newNodeBefore = (first.kind === AstNodeKind.List) ? first._prepend(nodeToPrepend) : nodeToPrepend;

		if (!newNodeBefore) {
			this.updateLength();
			return undefined;
		}

		if (this._items.length >= 3) {
			// assert this.items.length === 3

			// we need to split to maintain (2,3)-this property.
			const first = this._items.shift()!;
			this.updateLength();
			return new ListAstNode([newNodeBefore, first]);
		} else {
			this._items.unshift(newNodeBefore);
			this.updateLength();
			return undefined;
		}
	}
}

const emptyArray: readonly AstNode[] = [];

export class TextAstNode extends BaseAstNode {
	get kind(): AstNodeKind.Text {
		return AstNodeKind.Text;
	}
	get listHeight() {
		return 0;
	}
	get children(): readonly AstNode[] {
		return emptyArray;
	}

	canBeReused(
		getTokenAfterNode: () => Token,
		expectedClosingCategories: Set<number>
	) {
		return true;
	}

	normalizeLists(): TextAstNode {
		return this;
	}
	clone(): TextAstNode {
		return this;
	}
}

export class BracketAstNode extends BaseAstNode {
	get kind(): AstNodeKind.Bracket {
		return AstNodeKind.Bracket;
	}
	get listHeight() {
		return 0;
	}
	get children(): readonly AstNode[] {
		return emptyArray;
	}

	canBeReused(
		getTokenAfterNode: () => Token,
		expectedClosingCategories: Set<number>
	) {
		// These nodes could be reused,
		// but not in a general way.
		// Their parent may be reused.
		return false;
	}

	normalizeLists(): BracketAstNode {
		return this;
	}

	clone(): BracketAstNode {
		return this;
	}
}

export class InvalidBracketAstNode extends BaseAstNode {
	get kind(): AstNodeKind.UnexpectedClosingBracket {
		return AstNodeKind.UnexpectedClosingBracket;
	}
	get listHeight() {
		return 0;
	}
	get children(): readonly AstNode[] {
		return emptyArray;
	}

	canBeReused(
		getTokenAfterNode: () => Token,
		expectedClosingCategories: Set<number>
	) {
		// TODO expectedClosingCategories
		return false;
	}

	normalizeLists(): InvalidBracketAstNode {
		return this;
	}

	clone(): InvalidBracketAstNode {
		return this;
	}
}
