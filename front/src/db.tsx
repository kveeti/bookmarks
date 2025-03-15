import { faker } from "@faker-js/faker";
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
					filename: "file:db?vfs=opfs",
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
create table if not exists version (
	current integer not null
);`);

	const migrations = [
		`create table if not exists bookmarks (
	id text primary key not null,
	title text not null,
	url text not null,
	updated_at text not null,
	deleted_at text
);`,
	];

	const versionResult = await exec("select current from version limit 1");

	const currentVersion = versionResult?.row?.length ? versionResult.row[0] : 0;

	if (currentVersion === migrations.length) {
		return;
	}

	if (currentVersion > migrations.length) {
		throw new Error(
			`Database version ${currentVersion} is newer than supported version ${migrations.length}`
		);
	}

	try {
		await exec("begin transaction");

		for (let i = currentVersion; i < migrations.length; i++) {
			await exec(migrations[i]);
		}

		if (currentVersion === 0) {
			await exec("insert into version (current) values (?)", [migrations.length]);
		} else {
			await exec("update version set current = ?", [migrations.length]);
		}

		await exec("commit");
	} catch (error) {
		await exec("rollback");
		throw error;
	}
});

export function id() {
	return ulid();
}

export async function deleteBookmark(id: string) {
	const now = new Date().toISOString();
	await db.exec("update bookmarks set deleted_at = ?, updated_at = ? where id = ?", [
		now,
		now,
		id,
	]);
}

export type Bookmark = {
	id: string;
	title: string;
	url: string;
	updated_at: string;
};

// UI Components for import/export
export function DbExport() {
	return (
		<button
			class="focus border-gray-a5 h-9 border px-3"
			onClick={async () => {
				try {
					const root = await navigator.storage.getDirectory();
					const dbFile = await root.getFileHandle("data.sqlite3");
					const file = await dbFile.getFile();

					const blob = new Blob([await file.arrayBuffer()], {
						type: "application/x-sqlite3",
					});
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = `bookmarks-${new Date().toISOString().split("T")[0]}.sqlite`;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					URL.revokeObjectURL(url);
				} catch (error) {
					console.error("Error exporting database:", error);
					alert("Failed to export database");
				}
			}}
		>
			export db
		</button>
	);
}

export function DbImport() {
	return (
		<button
			class="focus border-gray-a5 h-9 border px-3"
			onClick={() => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept = ".sqlite";
				input.onchange = async (e) => {
					const file = (e.target as HTMLInputElement).files?.[0];
					if (!file) return;

					try {
						const arrayBuffer = await file.arrayBuffer();
						const root = await navigator.storage.getDirectory();
						const existingDb = await root.getFileHandle("db");
						if (existingDb) {
							await existingDb.remove();
						}
						const newDb = await root.getFileHandle("db", { create: true });
						const writable = await newDb.createWritable();
						await writable.write(arrayBuffer);
						await writable.close();

						alert("Database imported successfully! Reloading...");
						window.location.reload();
					} catch (error) {
						console.error("Error importing database:", error);
						alert("Failed to import database");
					}
				};
				input.click();
			}}
		>
			import db
		</button>
	);
}

export function DbReset() {
	return (
		<button
			class="focus border-gray-a5 h-9 border px-3"
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

export function DbSeed() {
	return (
		<button
			class="focus border-gray-a5 h-9 border px-3"
			onClick={async () => {
				const now = new Date().toISOString();
				const chunkSize = 1000; // Insert in chunks to avoid memory issues

				for (let i = 0; i < 100000; i += chunkSize) {
					const values = [];
					const params = [];

					for (let j = 0; j < chunkSize && i + j < 100000; j++) {
						values.push("(?, ?, ?, ?, ?)");

						// Generate realistic bookmark data
						const url = faker.internet.url();
						const title = faker.company.name();

						params.push(
							id(), // id
							title, // title
							url, // url
							null, // deleted_at
							now // updated_at
						);
					}

					await db.exec(
						`INSERT INTO bookmarks (id, title, url, deleted_at, updated_at)
						 VALUES ${values.join(",")}`,
						params
					);

					// Log progress
					console.log(`Seeded ${i + chunkSize} records...`);
				}

				console.log("Seeding complete!");
			}}
		>
			seed 100k
		</button>
	);
}
