import { batch, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import * as v from "valibot";
import { registerSW } from "virtual:pwa-register";

import { Bookmark, DbReset, db, id } from "./db";
import { TheInput } from "./the-input";

const BACK_URL = import.meta.env.VITE_BACK_URL;

const [showUpdate, setShowUpdate] = createSignal(false);
const [user, { refetch: refetchUser }] = usePromise<{ id: string; username: string } | null>(
	async () => {
		const res = await fetch(BACK_URL + "/api/me", {
			method: "GET",
			credentials: "include",
		});
		if (!res.ok) return null;
		return res.json();
	}
);

const updateSW = registerSW({
	onNeedRefresh() {
		setShowUpdate(true);
	},
	onOfflineReady() {},
});

type Message = {
	id: string;
	client_id: string;
	title: string;
	url: string;
	deleted_at: string;
	updated_at: string;
	created_at: string;
};

function subSse() {
	const eventSource = new EventSource(BACK_URL + "/api/events", { withCredentials: true });

	eventSource.onmessage = async (e) => {
		try {
			const parsedData = JSON.parse(e.data) as Message;
			console.log("new msg!", parsedData);

			await db.exec(
				`
insert into bookmarks (id, client_id, title, url, deleted_at, updated_at, created_at)
values (?, ?, ?, ?, ?, ?, ?)
on conflict(id)
do update set
	title = ?,
	url = ?,
	deleted_at = ?,
	updated_at = ?;
`,
				[
					parsedData.id,
					parsedData.client_id,
					parsedData.title,
					parsedData.url,
					parsedData.deleted_at,
					parsedData.updated_at,
					parsedData.created_at,
					parsedData.title,
					parsedData.url,
					parsedData.deleted_at,
					parsedData.updated_at,
				]
			);
		} catch (error) {
			console.error("invalid sse data", error);
		}
	};
}

const LAST_SYNC = "last_sync";

async function sync() {
	let lastSyncedAt = localStorage.getItem(LAST_SYNC) || 0;
	lastSyncedAt = new Date(lastSyncedAt);
	console.log({ lastSyncedAt });

	const updated = await db.query(
		`
select * from bookmarks
where updated_at > ?;
`,
		[lastSyncedAt.toISOString()]
	);

	if (!updated.length) return;

	const res = await fetch(BACK_URL + "/api/sync", {
		method: "POST",
		body: JSON.stringify(updated),
		headers: { "Content-Type": "application/json" },
		credentials: "include",
	});
	if (!res.ok) return;
	localStorage.setItem(LAST_SYNC, new Date().toISOString());
}

export function Entry() {
	createEffect(() => {
		if (user.value) {
			sync();
			subSse();
		}
	});

	return (
		<div class="mx-auto mt-[40vh] max-w-sm space-y-4 p-4">
			{!user.value && <Register />}
			{!user.value && <Login />}

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

async function deleteBookmark(id: string) {
	await db.exec("update bookmarks set deleted_at = ? where id = ?", [
		new Date().toISOString(),
		id,
	]);
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
				onSuccess={() => {
					sync();
					refetch();
				}}
			/>

			<EditBookmark
				bookmark={state.intent === "edit" && state.bookmark ? state.bookmark : null}
				onOpenChange={() => setState({})}
				onSuccess={() => {
					sync();
					refetch();
				}}
			/>

			<DeleteBookmark
				bookmark={state.intent === "delete" && state.bookmark ? state.bookmark : null}
				onOpenChange={() => setState({})}
				onSuccess={() => {
					sync();
					refetch();
				}}
			/>
		</>
	);
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

		const now = new Date().toISOString();
		await db.exec(
			"insert into bookmarks (id, client_id, title, url, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
			[id(), id(), data.title, data.url, now, now]
		);
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
		promise()
			.then((result) => {
				setState({ status: "resolved", result });
			})
			.catch((error) => {
				setState({ status: "rejected", result: error });
			});
	}

	createEffect(() => {
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

const authFormSchema = v.object({
	username: v.pipe(v.string(), v.minLength(1, "required")),
	password: v.pipe(v.string(), v.minLength(1, "required")),
});
function Register() {
	let dialog!: HTMLDialogElement;

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const t = e.currentTarget as HTMLFormElement;

		const data = Object.fromEntries(new FormData(t));
		if (!v.is(authFormSchema, data)) return;

		const res = await fetch(BACK_URL + "/api/auth/register", {
			method: "POST",
			body: JSON.stringify(data),
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		});
		if (!res.ok) return;
		refetchUser();

		dialog.close();
	}

	function onCancel() {
		dialog.close();
	}

	return (
		<>
			<button
				class="focus border-gray-a5 h-9 border px-3"
				onClick={() => {
					dialog.showModal();
				}}
			>
				register
			</button>

			<dialog
				ref={dialog}
				class="bg-gray-1 text-gray-12 border-gray-a5 m-auto min-w-[350px] border p-4 backdrop:backdrop-blur-xs"
			>
				<h2 class="text-lg font-medium">register</h2>

				<form class="mt-4 space-y-4" onSubmit={onSubmit}>
					<div class="space-y-1">
						<label for="username" class="block">
							username
						</label>
						<input
							type="text"
							name="username"
							id="username"
							class="focus border-gray-a4 h-9 w-full border px-2"
						/>
					</div>

					<div class="space-y-1">
						<label for="password" class="block">
							password
						</label>
						<input
							type="password"
							name="password"
							id="password"
							class="focus border-gray-a4 h-9 w-full border px-2"
						/>
					</div>

					<div class="flex justify-end gap-2">
						<button class="focus border-gray-a5 h-9 border px-3" onClick={onCancel}>
							cancel
						</button>
						<button class="focus bg-gray-a6 h-9 px-3">register</button>
					</div>
				</form>
			</dialog>
		</>
	);
}

function Login() {
	let dialog!: HTMLDialogElement;

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();

		const t = e.currentTarget as HTMLFormElement;

		const data = Object.fromEntries(new FormData(t));
		if (!v.is(authFormSchema, data)) return;

		const res = await fetch(BACK_URL + "/api/auth/login", {
			method: "POST",
			body: JSON.stringify(data),
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		});
		if (!res.ok) return;
		refetchUser();
		dialog.close();
	}

	function onCancel() {
		dialog.close();
	}

	return (
		<>
			<button
				class="focus border-gray-a5 h-9 border px-3"
				onClick={() => {
					dialog.showModal();
				}}
			>
				login
			</button>

			<dialog
				ref={dialog}
				class="bg-gray-1 text-gray-12 border-gray-a5 m-auto min-w-[350px] border p-4 backdrop:backdrop-blur-xs"
			>
				<h2 class="text-lg font-medium">login</h2>

				<form class="mt-4 space-y-4" onSubmit={onSubmit}>
					<div class="space-y-1">
						<label for="username" class="block">
							username
						</label>
						<input
							type="text"
							name="username"
							id="username"
							class="focus border-gray-a4 h-9 w-full border px-2"
						/>
					</div>

					<div class="space-y-1">
						<label for="password" class="block">
							password
						</label>
						<input
							type="password"
							name="password"
							id="password"
							class="focus border-gray-a4 h-9 w-full border px-2"
						/>
					</div>

					<div class="flex justify-end gap-2">
						<button class="focus border-gray-a5 h-9 border px-3" onClick={onCancel}>
							cancel
						</button>
						<button class="focus bg-gray-a6 h-9 px-3">login</button>
					</div>
				</form>
			</dialog>
		</>
	);
}
