<script lang="ts">
	import { onMount } from 'svelte';
	import { mdiImageAlbum, mdiRefresh } from '@mdi/js';
	import { Alert, Button, Checkbox, Input } from '@immich/ui';
	import * as adminApi from '$lib/services/admin';
	import type { AccountAlbumDto, ServerAccountSettings } from '$lib/immichFrameApi';

	interface Props {
		account: ServerAccountSettings;
	}

	let { account }: Props = $props();

	let loading = $state(false);
	let error: string | null = $state(null);
	let albums: AccountAlbumDto[] = $state([]);
	let filterText = $state('');
	let hasFetched = $state(false);

	onMount(() => {
		if (account.immichServerUrl && (account.apiKey || account.apiKeyFile)) {
			fetchAlbums();
		}
	});

	async function fetchAlbums() {
		if (!account.immichServerUrl || (!account.apiKey && !account.apiKeyFile)) {
			error = 'Enter Immich server URL and API key (or API key file) above to load albums.';
			return;
		}

		loading = true;
		error = null;
		try {
			const snapshot = $state.snapshot(account) as ServerAccountSettings;
			const res = await adminApi.getAccountAlbums(snapshot);
			if (res.status === 200) {
				albums = res.data ?? [];
				hasFetched = true;
			} else {
				const detail =
					(res.data as any)?.detail || (res.data as any)?.title || 'Failed to load albums';
				error = detail;
			}
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Failed to connect to ImmichFrame server';
		} finally {
			loading = false;
		}
	}

	function isAllowlisted(albumId: string): boolean {
		return (account.albums ?? []).includes(albumId);
	}

	function isBlocklisted(albumId: string): boolean {
		return (account.excludedAlbums ?? []).includes(albumId);
	}

	function toggleAllowlist(albumId: string, checked: boolean) {
		const currentAllows = new Set(account.albums ?? []);
		const currentBlocks = new Set(account.excludedAlbums ?? []);

		if (checked) {
			currentAllows.add(albumId);
			currentBlocks.delete(albumId);
		} else {
			currentAllows.delete(albumId);
		}

		account.albums = Array.from(currentAllows);
		account.excludedAlbums = Array.from(currentBlocks);
	}

	function toggleBlocklist(albumId: string, checked: boolean) {
		const currentAllows = new Set(account.albums ?? []);
		const currentBlocks = new Set(account.excludedAlbums ?? []);

		if (checked) {
			currentBlocks.add(albumId);
			currentAllows.delete(albumId);
		} else {
			currentBlocks.delete(albumId);
		}

		account.albums = Array.from(currentAllows);
		account.excludedAlbums = Array.from(currentBlocks);
	}

	let filteredAlbums = $derived(
		albums.filter((a) => (a.albumName ?? '').toLowerCase().includes(filterText.trim().toLowerCase()))
	);

	let allowCount = $derived(albums.filter((a) => (account.albums ?? []).includes(a.id)).length);

	let blockCount = $derived(
		albums.filter((a) => (account.excludedAlbums ?? []).includes(a.id)).length
	);

	let unlistedAllowCount = $derived(
		(account.albums ?? []).filter((id) => !albums.some((a) => a.id === id)).length
	);

	let unlistedBlockCount = $derived(
		(account.excludedAlbums ?? []).filter((id) => !albums.some((a) => a.id === id)).length
	);

	function clearUnlistedIds() {
		const knownIds = new Set(albums.map((a) => a.id));
		account.albums = (account.albums ?? []).filter((id) => knownIds.has(id));
		account.excludedAlbums = (account.excludedAlbums ?? []).filter((id) => knownIds.has(id));
	}
</script>

<div class="mt-4 flex flex-col gap-3">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h4 class="text-base font-semibold text-gray-900 dark:text-gray-100">Albums</h4>
			<p class="text-xs text-gray-500 dark:text-gray-400">
				Manage allowlisted and excluded albums for this account.
			</p>
		</div>

		<div class="flex items-center gap-2">
			{#if hasFetched}
				<div class="text-xs text-gray-500 dark:text-gray-400">
					{allowCount} allowed • {blockCount} blocked
				</div>
			{/if}
			<Button
				leadingIcon={mdiRefresh}
				variant="outline"
				color="secondary"
				size="small"
				loading={loading}
				onclick={fetchAlbums}
			>
				{loading ? 'Loading…' : hasFetched ? 'Refresh albums' : 'Load albums'}
			</Button>
		</div>
	</div>

	{#if error}
		<Alert color="danger">{error}</Alert>
	{/if}

	{#if !hasFetched && !loading && !error}
		<div
			class="flex flex-col items-center justify-center rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center"
		>
			<p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
				Album allowlist and blocklist are managed with human-readable titles.
			</p>
			<Button
				leadingIcon={mdiImageAlbum}
				variant="outline"
				color="secondary"
				size="small"
				onclick={fetchAlbums}
			>
				Load albums from Immich
			</Button>
		</div>
	{:else if hasFetched}
		<div class="flex items-center gap-2">
			<div class="relative flex-1">
				<Input
					placeholder="Search albums by title…"
					value={filterText}
					oninput={(e) => (filterText = e.currentTarget.value)}
				/>
			</div>
			{#if filterText}
				<Button variant="ghost" size="small" onclick={() => (filterText = '')}>Clear</Button>
			{/if}
		</div>

		<div
			class="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
		>
			<div
				class="grid grid-cols-[1fr_85px_85px] sm:grid-cols-[1fr_105px_105px] items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
			>
				<div>Album Title</div>
				<div class="text-center">Allowlist</div>
				<div class="text-center">Blocklist</div>
			</div>

			<div class="max-h-64 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
				{#each filteredAlbums as album (album.id)}
					<div
						class="grid grid-cols-[1fr_85px_85px] sm:grid-cols-[1fr_105px_105px] items-center px-4 py-2.5 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
					>
						<div class="min-w-0 pr-3">
							<div
								class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
								title={album.albumName}
							>
								{album.albumName}
							</div>
							{#if album.assetCount !== undefined && album.assetCount !== null}
								<div class="text-xs text-gray-500 dark:text-gray-400">
									{album.assetCount}
									{album.assetCount === 1 ? 'asset' : 'assets'}
								</div>
							{/if}
						</div>
						<div class="flex justify-center">
							<Checkbox
								checked={isAllowlisted(album.id)}
								onCheckedChange={(checked) => toggleAllowlist(album.id, checked)}
							/>
						</div>
						<div class="flex justify-center">
							<Checkbox
								checked={isBlocklisted(album.id)}
								onCheckedChange={(checked) => toggleBlocklist(album.id, checked)}
							/>
						</div>
					</div>
				{:else}
					<div class="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
						{#if filterText.trim()}
							No albums match "{filterText}".
						{:else}
							No albums available for this account.
						{/if}
					</div>
				{/each}
			</div>
		</div>

		{#if unlistedAllowCount > 0 || unlistedBlockCount > 0}
			<div
				class="flex flex-col gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 sm:flex-row sm:items-center sm:justify-between"
			>
				<div>
					Saved IDs not found in current Immich album list:
					<span class="font-medium"
						>{unlistedAllowCount} allowed, {unlistedBlockCount} blocked</span
					>. These will be preserved when saving.
				</div>
				<Button variant="outline" color="secondary" size="small" onclick={clearUnlistedIds}>
					Clear unlisted IDs
				</Button>
			</div>
		{/if}
	{/if}
</div>
