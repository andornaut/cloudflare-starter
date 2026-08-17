<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { site } from "$lib/config";
  import { EMAIL_MAX_LENGTH, MESSAGE_MAX_LENGTH } from "$lib/validation";

  import type { PageProps } from "./$types";

  const { data, form }: PageProps = $props();
</script>

<h1>Hello, world - Cloudflare starter</h1>
<p>{site.description}</p>

<h2>Sign the guestbook</h2>

{#if form?.success}
  <p>Thanks, your entry was added.</p>
{/if}
{#if form?.formError}
  <p class="error">{form.formError}</p>
{/if}

<form method="POST" use:enhance>
  <p>
    <label for="email">Email</label>
    <input
      id="email"
      name="email"
      type="email"
      maxlength={EMAIL_MAX_LENGTH}
      required
      value={form?.values?.email ?? ""}
    />
    {#if form?.errors?.email}
      <span class="error">{form.errors.email}</span>
    {/if}
  </p>
  <p>
    <label for="message">Message</label>
    <textarea
      id="message"
      name="message"
      rows="4"
      maxlength={MESSAGE_MAX_LENGTH}
      required>{form?.values?.message ?? ""}</textarea
    >
    {#if form?.errors?.message}
      <span class="error">{form.errors.message}</span>
    {/if}
  </p>
  <!-- Honeypot. A browser leaves it empty; a bot that fills every field does not. -->
  <p class="honeypot" aria-hidden="true">
    <label for="website">Leave this field empty</label>
    <input
      id="website"
      name="website"
      type="text"
      tabindex="-1"
      autocomplete="off"
    />
  </p>
  <button type="submit">Add entry</button>
</form>

<h2>Latest {site.entryLimit} guestbook entries</h2>

{#if data.databaseMissing}
  <p class="notice">
    The guestbook database is not configured, so no entries can be listed. Run
    <code>npm run migrate</code> and check the <code>DB</code> binding in
    <code>wrangler.jsonc</code>.
  </p>
{:else if data.entries.length === 0}
  <p>No entries yet. Yours would be the first.</p>
{:else}
  <ul>
    {#each data.entries as entry (entry.id)}
      <li>
        <!-- Svelte escapes these, so a <script> payload renders as inert text. -->
        <p>{entry.message}</p>
        <small>{entry.emailMasked} - {entry.created_at}</small>
      </li>
    {/each}
  </ul>
{/if}

<!-- Points at /admin rather than the sign-in page, so an admin with a valid
	session lands on the table and everyone else is redirected to sign in. -->
<footer>
  <a href={resolve("/admin")}>Admin</a>
</footer>

<style>
  .honeypot {
    position: absolute;
    left: -9999px;
  }

  ul {
    padding: 0;
    list-style: none;
  }

  li {
    margin-bottom: 1rem;
    padding: 0.75rem;
    border: 1px solid #e3e3e8;
    border-radius: 6px;
    background: #fff;
  }

  li p {
    margin: 0 0 0.25rem;
    white-space: pre-wrap;
  }

  small {
    color: #666;
  }

  footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #e3e3e8;
    font-size: 0.9rem;
  }
</style>
