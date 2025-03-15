import { createEffect } from "solid-js";
import * as v from "valibot";

import { db, id } from "./db";

export const formSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1, "required")),
	url: v.pipe(v.string(), v.minLength(1, "required")),
});

export function NewBookmark(props: {
	initialValue?: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => any;
	onSuccess: () => void;
}) {
	let dialog!: HTMLDialogElement;

	function onClose() {
		props.onOpenChange(false);
	}
	createEffect(() => {
		if (props.isOpen) {
			dialog.showModal();
		}

		dialog.addEventListener("close", onClose);
		return () => dialog.removeEventListener("close", onClose);
	});

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const t = e.currentTarget as HTMLFormElement;

		const data = Object.fromEntries(new FormData(t));
		if (!v.is(formSchema, data)) return;

		const now = new Date().toISOString();
		await db.exec("insert into bookmarks (id, title, url, updated_at) values (?, ?, ?, ?)", [
			id(),
			data.title,
			data.url,
			now,
		]);
		t.reset();
		props.onSuccess();
		dialog.close();
	}

	function onCancel() {
		dialog.close();
	}

	return (
		<dialog
			ref={dialog}
			class="bg-gray-1 text-gray-12 border-gray-a5 m-auto min-w-[350px] border p-4 backdrop:backdrop-blur-xs"
		>
			<h2 class="text-lg font-medium">new bookmark</h2>

			<form class="mt-4 space-y-4" onSubmit={onSubmit}>
				<div class="space-y-1">
					<label for="title" class="block">
						title
					</label>
					<input
						type="text"
						name="title"
						id="title"
						value={props.initialValue}
						class="focus border-gray-a4 h-9 w-full border px-2"
					/>
				</div>

				<div class="space-y-1">
					<label for="url" class="block">
						url
					</label>
					<input
						type="text"
						name="url"
						id="url"
						class="focus border-gray-a4 h-9 w-full border px-2"
					/>
				</div>

				<div class="flex justify-end gap-2">
					<button class="focus border-gray-a5 h-9 border px-3" onClick={onCancel}>
						cancel
					</button>
					<button class="focus bg-gray-a6 h-9 px-3">add</button>
				</div>
			</form>
		</dialog>
	);
}
