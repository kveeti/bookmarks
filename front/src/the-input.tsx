import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import { batch, createEffect } from "solid-js";
import { createStore } from "solid-js/store";

import { Bookmark } from "./db";

export function TheInput(props: {
	items: Array<Bookmark> | null;
	onInput: (value: string) => any;
	onSelect: (id: string) => any;
	onCreate: (value: string) => any;
	onEdit: (value: string) => any;
	onDelete: (id: string, forced: boolean) => any;
}) {
	let input: HTMLInputElement = null as any;
	let results: HTMLUListElement = null as any;
	let focusedId: string | null = null;

	const [state, setState] = createStore({
		value: "",
		isVisible: false,
		resultsLeft: 0,
		resultsTop: 0,
		resultsWidth: 0,
	});

	const isCreateVisible = () => state.value.length && !props.items?.length;

	function moveFocus(dir: number) {
		const focused = results.querySelector("[data-focused=true]");
		let nextFocused: HTMLLinkElement | null = null;

		if (focused) {
			focused.removeAttribute("data-focused");

			nextFocused = focused[
				dir === 1 ? "nextElementSibling" : "previousElementSibling"
			] as HTMLLinkElement;

			if (!nextFocused) {
				nextFocused = results[
					dir === 1 ? "firstElementChild" : "lastElementChild"
				] as HTMLLinkElement;
			}
		} else {
			nextFocused = results.firstElementChild as HTMLLinkElement;
		}

		if (!nextFocused) return;

		const nextFocusedId = nextFocused.getAttribute("data-id");
		if (!nextFocusedId) return;

		focusedId = nextFocusedId;
		nextFocused.setAttribute("data-focused", "true");
		nextFocused.scrollIntoView({
			behavior: "instant",
			block: "nearest",
		});
	}

	function moveFocusToFirst() {
		const focused = results.querySelector("[data-focused=true]");
		const nextFocused = results.firstElementChild;
		if (nextFocused) {
			// this id is "__create__" when user selects the `create "{value}"`
			const nextFocusedId = nextFocused.getAttribute("data-id");
			focusedId = nextFocusedId;

			focused?.removeAttribute("data-focused");
			nextFocused.setAttribute("data-focused", "true");
			nextFocused.scrollIntoView({
				behavior: "instant",
				block: "nearest",
			});
		}
	}

	createEffect(() => {
		function update() {
			computePosition(input, results, {
				placement: "bottom-start",
				middleware: [
					offset(6),
					flip(),
					shift(),
					size({
						apply(props) {
							setState("resultsWidth", props.rects.reference.width);
						},
					}),
				],
			}).then(({ x, y }) => {
				batch(() => {
					setState("resultsTop", y);
					setState("resultsLeft", x);
				});
			});
		}

		const cleanup = autoUpdate(input, results, update);

		// TODO: ??
		if (!state.isVisible) {
			cleanup();
		}
	});

	createEffect(() => {
		props.items;
		state.value;

		if (!state.isVisible) return;
		moveFocusToFirst();
	});

	return (
		<>
			<input
				ref={input}
				autocapitalize="off"
				autocomplete="off"
				autocorrect="off"
				autofocus={true}
				class="focus bg-gray-a3 border-gray-a4 h-10 w-full border px-2 text-base"
				placeholder="search bookmarks..."
				onBlur={() => {
					setState("isVisible", false);
				}}
				onFocus={() => {
					if (state.value) {
						setState("isVisible", true);
					}
				}}
				onInput={(e) => {
					const value = e.target.value;
					props.onInput(value ?? "");
					batch(() => {
						setState("value", value);
						setState("isVisible", value ? true : false);
					});
				}}
				onKeyDown={(e) => {
					if (e.key === "ArrowUp") {
						moveFocus(-1);
						e.preventDefault();
						setState("isVisible", true);
					} else if (e.key === "ArrowDown") {
						moveFocus(1);
						e.preventDefault();
						setState("isVisible", true);
					} else if (e.key === "Enter") {
						e.preventDefault();

						if (isCreateVisible() || focusedId === "__create__" || e.metaKey) {
							props.onCreate(state.value);
							return;
						}
						if (!focusedId) return;
						if (e.shiftKey) {
							props.onEdit(focusedId);
							return;
						}
						props.onSelect(focusedId);
					} else if (e.key === "Backspace" && e.shiftKey) {
						if (!focusedId) return;
						e.preventDefault();
						props.onDelete(focusedId, e.metaKey);
					}
				}}
			/>

			<ul
				ref={results}
				class="bg-gray-1 border-gray-a5 divide-gray-a4 absolute top-0 left-0 divide-y border"
				style={{
					left: state.resultsLeft + "px",
					top: state.resultsTop + "px",
					display: state.isVisible ? "block" : "none",
					"min-width": state.resultsWidth + "px",
				}}
			>
				{props.items?.length
					? props.items?.map((i) => (
							<li data-id={i.id} class="data-focused:bg-gray-a5 px-2 py-1">
								{i.title}
							</li>
						))
					: isCreateVisible() && (
							<li data-id="__create__" class="data-focused:bg-gray-a5 px-2 py-1">
								create "{state.value}"
							</li>
						)}
			</ul>
		</>
	);
}
