<script lang="ts">
	import { enhance } from '$app/forms';

	import type { PageProps } from './$types';

	const { form }: PageProps = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<h1>Admin sign-in</h1>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

<form method="POST" use:enhance>
	<p>
		<label for="secret">Secret</label>
		<!-- Never prefilled: the submitted value is not echoed back. -->
		<input id="secret" name="secret" type="password" autocomplete="current-password" required />
	</p>
	<button type="submit">Sign in</button>
</form>
