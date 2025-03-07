/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { asArray } from 'vs/base/common/arrays';
import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { HoverProviderRegistry } from 'vs/editor/common/modes';
import { ILanguageService } from 'vs/editor/common/services/languageService';
import { getHover } from 'vs/editor/contrib/hover/getHover';
import { HoverAnchor, HoverAnchorType, IEditorHover, IEditorHoverParticipant, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/hoverTypes';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';

const $ = dom.$;

export class MarkdownHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<MarkdownHover>,
		public readonly range: Range,
		public readonly contents: IMarkdownString[],
		public readonly ordinal: number
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hover: IEditorHover,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	public createLoadingMessage(anchor: HoverAnchor): MarkdownHover | null {
		return new MarkdownHover(this, anchor.range, [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))], 2000);
	}

	public computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): MarkdownHover[] {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return [];
		}

		const model = this._editor.getModel();
		const lineNumber = anchor.range.startLineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		const result: MarkdownHover[] = [];

		let index = 1000;

		const lineLength = model.getLineLength(lineNumber);
		const languageId = model.getLanguageIdAtPosition(anchor.range.startLineNumber, anchor.range.startColumn);
		const maxTokenizationLineLength = this._configurationService.getValue<number>('editor.maxTokenizationLineLength', {
			overrideIdentifier: languageId
		});
		if (typeof maxTokenizationLineLength === 'number' && lineLength >= maxTokenizationLineLength) {
			result.push(new MarkdownHover(this, anchor.range, [{
				value: nls.localize('too many characters', "Tokenization is skipped for long lines for performance reasons. This can be configured via `editor.maxTokenizationLineLength`.")
			}], index++));
		}

		for (const d of lineDecorations) {
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			const hoverMessage = d.options.hoverMessage;
			if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
				continue;
			}

			const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
			result.push(new MarkdownHover(this, range, asArray(hoverMessage), index++));
		}

		return result;
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<MarkdownHover> {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return AsyncIterableObject.EMPTY;
		}

		const model = this._editor.getModel();

		if (!HoverProviderRegistry.has(model)) {
			return AsyncIterableObject.EMPTY;
		}

		const position = new Position(anchor.range.startLineNumber, anchor.range.startColumn);
		return getHover(model, position, token)
			.filter(item => !isEmptyMarkdownString(item.hover.contents))
			.map(item => {
				const rng = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
				return new MarkdownHover(this, rng, item.hover.contents, item.ordinal);
			});
	}

	public renderHoverParts(hoverParts: MarkdownHover[], fragment: DocumentFragment, statusBar: IEditorHoverStatusBar): IDisposable {
		return renderMarkdownHovers(hoverParts, fragment, this._editor, this._hover, this._languageService, this._openerService);
	}
}

export function renderMarkdownHovers(
	hoverParts: MarkdownHover[],
	fragment: DocumentFragment,
	editor: ICodeEditor,
	hover: IEditorHover,
	languageService: ILanguageService,
	openerService: IOpenerService,
): IDisposable {

	// Sort hover parts to keep them stable since they might come in async, out-of-order
	hoverParts.sort((a, b) => a.ordinal - b.ordinal);

	const disposables = new DisposableStore();
	for (const hoverPart of hoverParts) {
		for (const contents of hoverPart.contents) {
			if (isEmptyMarkdownString(contents)) {
				continue;
			}
			const markdownHoverElement = $('div.hover-row.markdown-hover');
			const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
			const renderer = disposables.add(new MarkdownRenderer({ editor }, languageService, openerService));
			disposables.add(renderer.onDidRenderAsync(() => {
				hoverContentsElement.className = 'hover-contents code-hover-contents';
				hover.onContentsChanged();
			}));
			const renderedContents = disposables.add(renderer.render(contents));
			hoverContentsElement.appendChild(renderedContents.element);
			fragment.appendChild(markdownHoverElement);
		}
	}
	return disposables;
}
