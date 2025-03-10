import { sqlite3Worker1Promiser } from "@sqlite.org/sqlite-wasm";
import { ulid } from "ulid";

type Db = {};

function getExec(dbId: string, db: Db) {
	return async function exec(sql: string, vars?: any[]) {
		return new Promise((res) => {
			db("exec", {
				dbId,
				sql,
				bind: vars,
				callback: (result) => {
					res(result);
				},
			});
		});
	};
}

function getQuery(dbId: string, db: Db) {
	return async function exec(sql: string, vars?: any[]) {
		return new Promise((res) => {
			const rows = [];

			db("exec", {
				dbId,
				sql,
				bind: vars,
				callback: (result) => {
					const values = result.row;
					if (!values) {
						res(rows);
						return;
					}

					const cols = result.columnNames;
					if (cols.length != values.length) {
						throw new Error("??" + JSON.stringify({ cols, values }, null, 2));
					}

					const mapped = {};
					for (let i = 0; i < cols.length; i++) {
						mapped[cols[i]] = values[i];
					}
					rows.push(mapped);
				},
			});
		});
	};
}

export function sqlite(migrations: (db) => Promise<void>) {
	let dbId;
	let query;
	let exec;

	const initPromise = new Promise((resolve) => {
		console.log("sqlite initializing...");

		const promiser = sqlite3Worker1Promiser({
			onready: async () => {
				const configResponse = await promiser("config-get", {});
				console.log("sqlite version", configResponse.result.version.libVersion);

				const openResponse = await promiser("open", {
					filename: "file:data.sqlite3?vfs=opfs",
				});
				dbId = openResponse.dbId;
				console.log(
					"sqlite db created at",
					openResponse.result.filename.replace(/^file:(.*?)\?vfs=opfs$/, "$1")
				);

				await migrations(getExec(dbId, promiser));

				query = getQuery(dbId, promiser);
				exec = getExec(dbId, promiser);

				console.log("sqlite initialized");

				resolve(promiser);
			},
		});
	});

	return {
		query: async (sql: string, vars?: any[]) => {
			if (!dbId) await initPromise;
			return await query(sql, vars);
		},
		exec: async (sql: string, vars?: any[]) => {
			if (!dbId) await initPromise;
			return await exec(sql, vars);
		},
	};
}

export const db = sqlite(async (exec) => {
	await exec(`
create table if not exists bookmarks (
	id text primary key not null,
	title text,
	url text
);`);
});

export function id() {
	return ulid();
}

export type Bookmark = {
	id: string;
	title: string;
	url: string;
};

export function DbReset() {
	return (
		<button
			class="focus"
			onClick={async () => {
				if (confirm("reset db?")) {
					await (await navigator.storage.getDirectory()).remove({ recursive: true });

					console.log("db reset");

					// reload to trigger db init naturally
					window.location.reload();
				}
			}}
		>
			reset db
		</button>
	);
}
