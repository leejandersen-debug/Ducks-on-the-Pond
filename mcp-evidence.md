# MCP Evidence — No-Paste Demo and Scoped Config

Ducks on the Pond Cards · 2026-11-08 · Server: `@modelcontextprotocol/server-filesystem`, launched with exactly the command and folders in Claude Desktop's config (below).

**What this shows:** the AI reaches the app's help documents itself, through MCP tool calls. No document text is pasted into the chat. It can read only the folders the config names: the access log below shows a refusal for every path outside them.

**How it was run:** Claude Code started the server over stdio from the config file and called its tools, logging each call. Claude Desktop launches the same server with the same arguments.

## 1. The scoped config

`~/Library/Application Support/Claude/claude_desktop_config.json` (the `mcpServers` section; it holds no keys or passwords):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/landersen/ai-workbench",
        "/Users/landersen/Claude/Code/Working Folder/Week 8/Ducks Corpus"
      ]
    },
    "ducks-on-the-pond": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/landersen/Claude/Code/Working Folder/Week 8/mcp-server/ducks-mcp.mjs"],
      "env": { "DUCKS_BASE_URL": "https://ducks-on-the-pond-psi.vercel.app" }
    }
  }
}
```

**Scope line:** my AI can read `/Users/landersen/ai-workbench` and `…/Week 8/Ducks Corpus`, and nothing else. The second server, `ducks-on-the-pond` (source in [`mcp-server/`](mcp-server/)), has no file access at all. It only calls the live site's public `POST /api/search` and `GET /api/health`.

## 2. What the AI can see

```
TRACE list_directory(Ducks Corpus) ->
   [FILE] capabilities-summary.txt         [FILE] pricing-guide.txt
   [FILE] collector-handbook.txt           [FILE] privacy-notice.txt
   [FILE] customer-service-policy.txt      [FILE] release-notes.txt
   [FILE] faq.txt                          [FILE] security-incident-response.txt
   [FILE] glossary.txt                     [FILE] serial-number-dispute-procedure.txt
   [FILE] indemnification-policy.txt       [FILE] terms-of-use.txt
   [FILE] users-guide.txt
```

13 help documents. The golden test key (`GoldenQuestions.txt`) was moved out of this folder on purpose, so the AI can't read the answers to its own test.

## 3. The no-paste demo

**Q1, single document:** "How do I undo a sale I entered by mistake?"
```
TRACE read_text_file(Ducks Corpus/users-guide.txt) -> 16723 chars
      | To reverse a sale entered by mistake, click "Undo sale" in the Sold table. The
      | card returns to your inventory. It stays not tradeable; turn Tradeable back on
```
Answer: click "Undo sale" in the Sold table. The card returns to your inventory but stays not tradeable until you turn Tradeable back on. *(users-guide.txt §6.5)*

**Q2, two documents:** "My serial number is already taken — where do I explain my side, and what evidence is strongest?"
```
TRACE read_text_file(Ducks Corpus/users-guide.txt) -> 16723 chars
      | Use the "Note for admin" box to explain, for example "I have the card in hand;
      | Track these under "My serial-number reviews" at the bottom of the page.
TRACE read_text_file(Ducks Corpus/serial-number-dispute-procedure.txt) -> 8379 chars
      | Strongest   A grading company cert whose record shows the serial number.
      | - The "Note for admin" cannot be edited after submission.
```
Answer: explain in the "Note for admin" box when you add the card (it can't be edited later), and follow the review under "My serial-number reviews". The strongest evidence is a grading company cert whose record shows the serial number. *(users-guide.txt §6.6 + serial-number-dispute-procedure.txt §5.2)*

**Q3, off the corpus:** "What phone number can I call for support?"
```
TRACE read_text_file(Ducks Corpus/customer-service-policy.txt) -> 10862 chars
      | Email:          support@ducksonthepondcards.com [TO CONFIRM]
TRACE read_text_file(Ducks Corpus/faq.txt) -> 10863 chars
      | A: Not yet. The web application works in a phone's browser.
```
Answer: the documents give no phone number, only the support email. Nothing is made up.

## 4. The scope holds

```
TRACE read_text_file(…/Week 8/.env.development.local)  -> Access denied - path outside allowed directories
TRACE read_text_file(…/Week 8/gates-ducks.md)          -> Access denied - path outside allowed directories
TRACE read_text_file(Ducks Corpus/../package.json)     -> Access denied - path outside allowed directories
TRACE read_text_file(…/Week 8/GoldenQuestions.txt)     -> Access denied - path outside allowed directories
```

The secrets file, the project's other files, a `../` escape attempt and the answer key are all refused.

## Notes

- The filesystem server's tools include write tools (`write_file`, `edit_file`, `move_file`), so this scope is read *and write* inside those two folders.
- Its `search_files` tool matches file names, not file contents, so to find a fact the AI reads whole files.
- The filesystem server runs through `npx -y`, so it fetches the latest published version on each launch unless pinned.
