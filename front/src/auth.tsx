import { Match, Switch } from "solid-js";
import * as v from "valibot";

import { refetchUser, user } from "./entry";
import { envs } from "./envs";

export function Auth() {
	return (
		<Switch>
			<Match when={user.value}>
				<Logout />
			</Match>
			<Match when={!user.value}>
				<Login />
			</Match>
		</Switch>
	);
}

const authFormSchema = v.object({
	username: v.pipe(v.string(), v.minLength(1, "required")),
	password: v.pipe(v.string(), v.minLength(1, "required")),
});
function Login() {
	let dialog!: HTMLDialogElement;

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();

		const t = e.currentTarget as HTMLFormElement;

		const data = Object.fromEntries(new FormData(t));
		if (!v.is(authFormSchema, data)) return;

		const res = await fetch(envs.BACK_URL + "/api/auth/login", {
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

function Logout() {
	async function onClick() {
		await fetch(envs.BACK_URL + "/api/auth/logout", {
			method: "POST",
			credentials: "include",
		});
		refetchUser();
	}
	return (
		<button class="focus border-gray-a5 h-9 border px-3" onClick={onClick}>
			logout
		</button>
	);
}
