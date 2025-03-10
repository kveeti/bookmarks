import { batch, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import * as v from "valibot";
import { registerSW } from "virtual:pwa-register";

import { Bookmark, DbReset, db, id } from "./db";
import { TheInput } from "./the-input";

const [showUpdate, setShowUpdate] = createSignal(false);

const updateSW = registerSW({
	onNeedRefresh() {
		setShowUpdate(true);
	},
	onOfflineReady() {},
});

export function Entry() {
	return (
		<div class="mx-auto mt-[40vh] max-w-sm space-y-4 p-4">
			{showUpdate() && (
				<button
					onClick={() => {
						setShowUpdate(false);
						updateSW();
					}}
				>
					update!
				</button>
			)}

			<Input />

			{import.meta.env.DEV && <DbReset />}
		</div>
	);
}

function Input() {
	const [inputVal, setInputVal] = createSignal("");
	const [isNewBookmarkOpen, setIsNewBookmarkOpen] = createSignal(false);
	const [state, setState] = createStore<
		| {
				intent: "delete" | "edit";
				bookmark: Bookmark;
		  }
		| {
				intent?: "delete" | "edit";
				bookmark?: Bookmark;
		  }
	>({});

	const [s, { refetch }] = usePromise<Array<Bookmark>>(
		() =>
			db.query("select * from bookmarks where title like ? limit 50", [
				"%" + inputVal() + "%",
			]),
		[]
	);

	function onCreate() {
		setIsNewBookmarkOpen(true);
	}

	function onEdit(id: string) {
		const item = s.value?.find((i) => i.id === id);
		if (!item) throw new Error("no item? - id: " + id);
		batch(() => {
			setState("bookmark", item);
			setState("intent", "edit");
		});
	}

	function onSelect(id: string) {
		const item = s.value?.find((i) => i.id === id);
		if (!item) throw new Error("no item? - id: " + id);

		navigate(item.url);
	}

	async function onDelete(id: string, forced = false) {
		const item = s.value?.find((i) => i.id === id);
		if (!item) throw new Error("no item? - id: " + id);

		if (forced) {
			await deleteBookmark(item.id);
			refetch();
			return;
		}

		batch(() => {
			setState("bookmark", item);
			setState("intent", "delete");
		});
	}

	return (
		<>
			<TheInput
				onCreate={onCreate}
				onSelect={onSelect}
				onInput={setInputVal}
				onEdit={onEdit}
				onDelete={onDelete}
				items={s.value}
			/>

			<NewBookmark
				initialValue={inputVal()}
				isOpen={isNewBookmarkOpen()}
				onOpenChange={(value) => setIsNewBookmarkOpen(value)}
				onSuccess={() => refetch()}
			/>

			<EditBookmark
				bookmark={state.intent === "edit" && state.bookmark ? state.bookmark : null}
				onOpenChange={() => setState({})}
				onSuccess={() => refetch()}
			/>

			<DeleteBookmark
				bookmark={state.intent === "delete" && state.bookmark ? state.bookmark : null}
				onOpenChange={() => setState({})}
				onSuccess={() => refetch()}
			/>
		</>
	);
}

async function deleteBookmark(id: string) {
	await db.query("delete from bookmarks where id = ?", [id]);
}

const formSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1, "required")),
	url: v.pipe(v.string(), v.minLength(1, "required")),
});
function NewBookmark(props: {
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

		await db.exec("insert into bookmarks (id, title, url) values (?, ?, ?)", [
			id(),
			data.title,
			data.url,
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

function DeleteBookmark(props: {
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

function EditBookmark(props: {
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

function navigate(url: string) {
	let goodUrl = url;
	if (!(goodUrl.includes("http://") || goodUrl.includes("https://"))) {
		goodUrl = "https://" + url;
	}

	window.location.href = goodUrl;
}

function usePromise<TResult>(promise: () => Promise<any>, defaultValue?: TResult) {
	const [state, setState] = createSignal<{
		status: "pending" | "resolved" | "rejected";
		result: TResult | null;
	}>({
		status: "pending",
		result: defaultValue || null,
	});

	function run() {
		promise().then(
			(result) => {
				setState({ status: "resolved", result });
			},
			(error) => setState({ status: "rejected", result: error })
		);
	}

	createEffect(() => {
		promise();
		run();
	});

	const retVal = {};
	Object.defineProperties(retVal, {
		state: { get: () => state() },
		loading: {
			get() {
				const s = state();
				return s.status === "pending";
			},
		},
		error: {
			get() {
				const s = state();
				if (s.status === "rejected") {
					return s.result;
				}

				return null;
			},
		},
		value: {
			get() {
				const s = state();
				return s.result;
			},
		},
	});

	return [
		retVal as {
			loading: boolean;
			error: any;
			value: TResult | null;
		},
		{ refetch: run },
	] as const;
}
