import { batch, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { registerSW } from "virtual:pwa-register";

import { Auth } from "./auth";
import { Bookmark, DbExport, DbImport, DbReset, DbSeed, db, deleteBookmark } from "./db";
import { DeleteBookmark } from "./delete-bookmark";
import { EditBookmark } from "./edit-bookmark";
import { NewBookmark } from "./new-bookmark";
import { Settings } from "./settings";
import { TheInput, normalizeUrl } from "./the-input";

const BACK_URL = import.meta.env.VITE_BACK_URL;
let refetchBookmarks: (() => void) | null = null;

const [showUpdate, setShowUpdate] = createSignal(false);
export const [user, { refetch: refetchUser }] = usePromise<{ id: string; username: string } | null>(
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
	title: string;
	url: string;
	deleted_at: string;
	updated_at: string;
};
function getSyncEnabled() {
	return localStorage.getItem(SYNC_ENABLED) === "true";
}

function subSse() {
	if (!getSyncEnabled()) return;

	const eventSource = new EventSource(BACK_URL + "/api/events", { withCredentials: true });

	eventSource.onmessage = async (e) => {
		try {
			const bookmark = JSON.parse(e.data) as Message;

			await db.exec(
				`
insert into bookmarks (id, title, url, deleted_at, updated_at)
values (?, ?, ?, ?, ?)
on conflict(id)
do update set
	title = ?,
	url = ?,
	deleted_at = ?,
	updated_at = ?;
`,
				[
					bookmark.id,
					bookmark.title,
					bookmark.url,
					bookmark.deleted_at,
					bookmark.updated_at,
					bookmark.title,
					bookmark.url,
					bookmark.deleted_at,
					bookmark.updated_at,
				]
			);

			refetchBookmarks?.();
		} catch (error) {
			console.error("invalid sse data", error);
		}
	};
}

const LAST_SYNC = "last_sync";
const SYNC_ENABLED = "sync_enabled";
const CHUNK_SIZE = 500;

async function init() {
	if (!getSyncEnabled()) return;

	const lastSyncedAt = localStorage.getItem(LAST_SYNC) || "1970-01-01T00:00:00.000Z";
	const syncStartedAt = new Date().toISOString();

	const localCount = await db.query("SELECT COUNT(*) as count FROM bookmarks limit 1;");
	const wasEmpty = localCount[0].count === 0;

	let serverCursor = null;
	while (true) {
		const response = await fetch(
			BACK_URL +
				`/api/bootstrap?cursor=${serverCursor || ""}&limit=${CHUNK_SIZE}&from=${lastSyncedAt}`,
			{ credentials: "include" }
		);

		if (!response.ok) throw new Error("Bootstrap failed");

		const { bookmarks, next_cursor } = await response.json();

		if (bookmarks.length > 0) {
			const values = [];
			const params = [];

			for (const bookmark of bookmarks) {
				values.push("(?, ?, ?, ?, ?)");
				params.push(
					bookmark.id,
					bookmark.title,
					bookmark.url,
					bookmark.deleted_at,
					bookmark.updated_at
				);
			}

			await db.exec(
				`INSERT INTO bookmarks (id, title, url, deleted_at, updated_at)
					 VALUES ${values.join(",")}
					 ON CONFLICT(id) DO UPDATE SET
					   title = excluded.title,
					   url = excluded.url,
					   deleted_at = excluded.deleted_at,
					   updated_at = excluded.updated_at`,
				params
			);
		}

		if (!next_cursor) break;
		serverCursor = next_cursor;
	}

	if (wasEmpty) return;

	let hasMore = true;
	let clientCursor = null;

	while (hasMore) {
		const localChanges = await db.query(
			`SELECT * FROM bookmarks 
					 WHERE updated_at > ? 
					 AND updated_at <= ?
					 AND (? IS NULL OR id > ?)
					 ORDER BY updated_at, id
					 LIMIT ?`,
			[lastSyncedAt, syncStartedAt, clientCursor, clientCursor, CHUNK_SIZE]
		);

		hasMore = localChanges.length === CHUNK_SIZE;
		if (hasMore) {
			clientCursor = localChanges[localChanges.length - 1].id;
		}

		if (localChanges.length > 0) {
			const response = await fetch(BACK_URL + "/api/sync", {
				method: "POST",
				body: JSON.stringify({
					bookmarks: localChanges,
				}),
				headers: { "Content-Type": "application/json" },
				credentials: "include",
			});

			if (!response.ok) throw new Error("Sync failed");
		}
	}
	localStorage.setItem(LAST_SYNC, syncStartedAt);
}

async function sync() {
	if (!getSyncEnabled()) return;

	const lastSyncedAt = localStorage.getItem(LAST_SYNC) || "1970-01-01T00:00:00.000Z";

	let hasMore = true;
	let clientCursor = null;

	while (hasMore) {
		const localChanges = await db.query(
			`SELECT * FROM bookmarks 
					 WHERE updated_at > ? 
					 AND (? IS NULL OR id > ?)
					 ORDER BY updated_at, id
					 LIMIT ?`,
			[lastSyncedAt, clientCursor, clientCursor, CHUNK_SIZE]
		);

		hasMore = localChanges.length === CHUNK_SIZE;
		if (hasMore) {
			clientCursor = localChanges[localChanges.length - 1].id;
		}

		if (localChanges.length > 0) {
			const response = await fetch(BACK_URL + "/api/sync", {
				method: "POST",
				body: JSON.stringify({
					bookmarks: localChanges,
				}),
				headers: { "Content-Type": "application/json" },
				credentials: "include",
			});

			if (!response.ok) throw new Error("Sync failed");
		}
	}
	localStorage.setItem(LAST_SYNC, new Date().toISOString());
}

export function Entry() {
	createEffect(() => {
		if (user.value) {
			init();
			subSse();
		}
	});

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

			{import.meta.env.DEV && (
				<div class="flex flex-wrap gap-2">
					<DbReset />
					<DbSeed />
					<DbExport />
					<DbImport />
					<Auth />
				</div>
			)}
		</div>
	);
}

function Input() {
	const [inputVal, setInputVal] = createSignal("");
	const [isNewBookmarkOpen, setIsNewBookmarkOpen] = createSignal(false);
	const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);
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
			db.query("select * from bookmarks where title like ? and deleted_at is null limit 10", [
				"%" + inputVal() + "%",
			]),
		[]
	);
	refetchBookmarks = refetch;

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

		window.location.href = normalizeUrl(item.url);
	}

	async function onDelete(id: string, forced = false) {
		const item = s.value?.find((i) => i.id === id);
		if (!item) throw new Error("no item? - id: " + id);

		if (forced) {
			await deleteBookmark(item.id);
			sync();
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
				onSettings={() => {
					setIsSettingsOpen(true);
				}}
				onCreate={onCreate}
				onSelect={onSelect}
				onInput={setInputVal}
				onEdit={onEdit}
				onDelete={onDelete}
				items={s.value}
			/>

			<Settings isOpen={isSettingsOpen()} onOpenChange={setIsSettingsOpen} />

			<NewBookmark
				initialValue={inputVal()}
				isOpen={isNewBookmarkOpen()}
				onOpenChange={(value) => setIsNewBookmarkOpen(value)}
				onSuccess={() => {
					sync();
				}}
			/>

			<EditBookmark
				bookmark={state.intent === "edit" && state.bookmark ? state.bookmark : null}
				onOpenChange={() => setState({})}
				onSuccess={() => {
					sync();
				}}
			/>

			<DeleteBookmark
				bookmark={state.intent === "delete" && state.bookmark ? state.bookmark : null}
				onOpenChange={() => setState({})}
				onSuccess={() => {
					sync();
				}}
			/>
		</>
	);
}

export function ToggleSyncEnabled() {
	const [toggleState, setToggleState] = createSignal(getSyncEnabled());

	function onClick() {
		const newState = !toggleState();
		setToggleState(newState);
		localStorage.setItem(SYNC_ENABLED, String(newState));

		if (newState && user.value) {
			init();
			sync();
		}
	}

	return (
		<button class="focus border-gray-a5 h-9 border px-3" onClick={onClick}>
			{toggleState() ? "disable sync" : "enable sync"}
		</button>
	);
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
