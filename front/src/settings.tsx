import { createEffect } from "solid-js";
import * as v from "valibot";

import { Auth } from "./auth";
import { DbExport, DbImport, DbReset } from "./db";
import { ToggleSyncEnabled } from "./entry";

export const formSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1, "required")),
	url: v.pipe(v.string(), v.minLength(1, "required")),
});

export function Settings(props: { isOpen: boolean; onOpenChange: (isOpen: boolean) => any }) {
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

	return (
		<dialog
			ref={dialog}
			class="bg-gray-1 text-gray-12 border-gray-a5 m-auto min-w-[350px] border p-4 backdrop:backdrop-blur-xs"
		>
			<h2 class="text-lg font-medium">settings</h2>

			<DbImport />
			<DbExport />
			<DbReset />
			<Auth />
			<ToggleSyncEnabled />
		</dialog>
	);
}
