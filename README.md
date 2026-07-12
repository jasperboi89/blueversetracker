# Account Command Center

## Freshdesk Intelligence

Freshdesk Intelligence uses a persistent, read-only search index so searches can inspect ticket
subjects, descriptions, custom fields, requester/company names, tags, replies, and public/private
notes across the full available ticket history.

After deploying the included Supabase migration:

1. Open **Freshdesk Intelligence** as an administrator.
2. Select **Show Search Debug**.
3. Under **Intelligence index**, choose **Build / refresh index**.
4. Wait for **Full sync complete: yes** before treating an empty result as authoritative.

The first build retrieves the complete ticket history in small resumable batches. If Freshdesk
temporarily rate-limits or rejects a conversation request, the cursor stays on that batch. Run the
refresh again after the API recovers. Later refreshes are incremental and only revisit tickets
updated since the previous run.

Search defaults to **All Time** and includes closed tickets. Account searches distinguish exact
account metadata from numbers merely mentioned in a description or conversation. Name and
natural-language searches combine full-text retrieval with AI ranking and evidence snippets.
