import { createEffect } from "solid-js";
import * as v from "valibot";

import { type Bookmark, db } from "./db";
import { formSchema } from "./new-bookmark";

export function EditBookmark(props: {
	bookmark: Bookmark | null;
	onOpenChange: (isOpen: boolean) => any;
	onSuccess: () => any;
}) {
	let dialog!: HTMLDialogElement;

	function onClose() {
		props.onOpenChange(false);
	}
	createEffect(() => {
		if (props.bookmark) {
			dialog.showModal();
		}

		dialog.addEventListener("close", onClose);
		return () => dialog.removeEventListener("close", onClose);
	});

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!props.bookmark?.id) return;
		const t = e.currentTarget as HTMLFormElement;

		const data = Object.fromEntries(new FormData(t));
		if (!v.is(formSchema, data)) return;

		await db.exec("update bookmarks set title = ?, url = ? where id = ?", [
			data.title,
			data.url,
			props.bookmark.id,
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
			<h2 class="text-lg font-medium">edit bookmark</h2>

			<form class="mt-4 space-y-4" onSubmit={onSubmit}>
				<div class="space-y-1">
					<label for="title" class="block">
						title
					</label>
					<input
						type="text"
						name="title"
						id="title"
						value={props.bookmark?.title}
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
						value={props.bookmark?.url}
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
