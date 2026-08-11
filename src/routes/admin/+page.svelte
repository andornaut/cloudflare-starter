<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { site } from '$lib/config';
	import { EMAIL_MAX_LENGTH, MESSAGE_MAX_LENGTH } from '$lib/validation';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<h1>Guestbook admin</h1>

<form method="POST" action="?/logout" use:enhance>
	<button type="submit">Sign out</button>
</form>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#if data.databaseMissing}
	<p class="notice">The guestbook database is not configured, so no entries can be listed.</p>
{/if}

<h2>Add an entry</h2>

<form method="POST" action="?/create&page={data.page}" use:enhance>
	<input type="hidden" name="page" value={data.page} />
	<p>
		<label for="create-email">Email</label>
		<input
			id="create-email"
			name="email"
			type="email"
			maxlength={EMAIL_MAX_LENGTH}
			required
			value={form?.values?.email ?? ''}
		/>
		{#if form?.errors?.email && form?.id == null}
			<span class="error">{form.errors.email}</span>
		{/if}
	</p>
	<p>
		<label for="create-message">Message</label>
		<textarea id="create-message" name="message" rows="3" maxlength={MESSAGE_MAX_LENGTH} required
			>{form?.values?.message ?? ''}</textarea
		>
		{#if form?.errors?.message && form?.id == null}
			<span class="error">{form.errors.message}</span>
		{/if}
	</p>
	<button type="submit">Add entry</button>
</form>

<h2>Entries</h2>

{#if data.entries.length === 0}
	<p>
		No entries on this page.
		<a href="{resolve('/admin')}?page=1">Back to page 1</a>
	</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Id</th>
				<th>Created</th>
				<th>Entry</th>
				<th>Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.entries as entry (entry.id)}
				<tr>
					<td>{entry.id}</td>
					<td>{entry.created_at}</td>
					<td>
						<form
							method="POST"
							action="?/update&page={data.page}"
							id="update-{entry.id}"
							use:enhance
						>
							<input type="hidden" name="id" value={entry.id} />
							<input type="hidden" name="page" value={data.page} />
							<input
								name="email"
								type="email"
								maxlength={EMAIL_MAX_LENGTH}
								required
								aria-label="Email for entry {entry.id}"
								value={form?.id === entry.id ? (form?.values?.email ?? '') : entry.email}
							/>
							<textarea
								name="message"
								rows="2"
								maxlength={MESSAGE_MAX_LENGTH}
								required
								aria-label="Message for entry {entry.id}"
								>{form?.id === entry.id ? (form?.values?.message ?? '') : entry.message}</textarea
							>
						</form>
						{#if form?.id === entry.id && form?.errors}
							<span class="error">{form.errors.email ?? form.errors.message}</span>
						{/if}
					</td>
					<td class="actions">
						<button type="submit" form="update-{entry.id}">Save</button>
						<form method="POST" action="?/delete&page={data.page}" use:enhance>
							<input type="hidden" name="id" value={entry.id} />
							<input type="hidden" name="page" value={data.page} />
							<button
								type="submit"
								onclick={(event) => {
									if (!confirm(`Delete entry ${entry.id}?`)) {
										event.preventDefault();
									}
								}}>Delete</button
							>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<!-- Links, not buttons, so paging works without JavaScript and a page is bookmarkable. -->
<p class="pagination">
	{#if data.hasPrev}
		<a href="{resolve('/admin')}?page={data.page - 1}">Previous</a>
	{:else}
		<span>Previous</span>
	{/if}
	Page {data.page} of {data.pageCount} ({data.total} entries, {site.adminPageSize} per page)
	{#if data.hasNext}
		<a href="{resolve('/admin')}?page={data.page + 1}">Next</a>
	{:else}
		<span>Next</span>
	{/if}
</p>

<style>
	table {
		width: 100%;
		border-collapse: collapse;
		background: #fff;
	}

	th,
	td {
		padding: 0.5rem;
		border-bottom: 1px solid #e3e3e8;
		text-align: left;
		vertical-align: top;
	}

	td.actions {
		display: flex;
		gap: 0.5rem;
		white-space: nowrap;
	}

	.pagination {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.pagination span {
		color: #999;
	}
</style>
