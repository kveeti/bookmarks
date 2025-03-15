import { createEffect } from "solid-js";

import { type Bookmark, deleteBookmark } from "./db";

export function DeleteBookmark(props: {
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

	async function onConfirm() {
		if (!props.bookmark?.id) return;
		await deleteBookmark(props.bookmark.id);
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
			<h2 class="mb-3 text-lg font-medium">delete bookmark</h2>

			<p class="mb-5">delete "{props.bookmark?.title}"?</p>

			<div class="flex justify-end gap-2">
				<button class="focus border-gray-a5 h-9 border px-3" onClick={onCancel}>
					cancel
				</button>
				<button class="focus bg-red-a6 h-9 px-3" onClick={onConfirm}>
					yes, delete
				</button>
			</div>
		</dialog>
	);
}
