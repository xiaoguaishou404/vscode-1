/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AstNode, ListAstNode } from './ast';

/**
 * Merges a list of (2,3) AstNode's into a single (2,3) AstNode.
*/
export function merge23Trees(items: AstNode[]): AstNode | null {
	if (items.length === 0) {
		return null;
	}
	if (items.length === 1) {
		return items[0];
	}

	const firstHeight = items[0].listHeight;
	if (items.every((e) => e.listHeight === firstHeight)) {
		// All trees have same height, just create parent nodes.
		while (items.length > 1) {
			let newItems = new Array<AstNode>(items.length >> 1);
			for (let i = 0; i < items.length >> 1; i++) {
				const first = items[2 * i];
				const second = items[2 * i + 1];
				if (2 * i + 3 === items.length) {
					const third = items[2 * i + 2];
					newItems[i] = new ListAstNode(
						[first, second, third]
					);
				} else {
					newItems[i] = new ListAstNode([
						first,
						second,
					]);
				}
			}
			items = newItems;
		}
		return items[0];
	}

	let first = items[0];
	let second = items[1];

	function heightDiff(node1: AstNode, node2: AstNode): number {
		return Math.abs(node1.listHeight - node2.listHeight);
	}

	for (let i = 2; i < items.length; i++) {
		const item = items[i];
		// Prefer concatenating smaller trees.
		if (heightDiff(first, second) <= heightDiff(second, item)) {
			first = concat(first, second);
			second = item;
		} else {
			second = concat(second, item);
		}
	}

	const result = concat(first, second);

	return result;
}

function concat(node1: AstNode, node2: AstNode): AstNode {
	if (node1.listHeight === node2.listHeight) {
		return new ListAstNode([node1, node2]);
	}
	else if (node1.listHeight > node2.listHeight) {
		// node1 is the tree we want to insert into
		return (node1 as ListAstNode).append(node2);
	} else {
		return (node2 as ListAstNode).prepend(node1);
	}
}
