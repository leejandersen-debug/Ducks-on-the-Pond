# Port Spec: Ask the Ducks Documents

DRAFT for review, 2026-11-08. Behavior, not implementation. The engine is the rig's (`scripts/ask.mjs`), moved unchanged. Only the surface around it is new.

## What it does

A visitor to the live site types a question about Ducks on the Pond Cards and gets a short written answer, taken only from the app's own help documents, with a receipt naming the document and section it came from. If the documents don't answer it, the visitor sees a clear "not in the documents" response instead of a guess.

## The route

`POST /api/ask` with `{"question": "..."}`. The question is 1–500 characters after trimming. Anyone can ask, signed in or not, the same as `/api/search` today.

## What it retrieves, and from where

- The question is embedded with the same model as the stored chunks (all-MiniLM-L6-v2), and the 3 closest chunks are taken, the same as the rig.
- **Store: the Postgres `doc_chunks` table, which holds the Ducks Corpus (70 chunks).** Not the local Chroma store, which the live site can't reach, and not any rig collection.
- Each chunk keeps its labels into the context: its document name (for example `users-guide.txt`) and its section (for example `6. MY COLLECTION › 6.5 Recording a sale`).
- No score floor before the model. All 3 chunks go to Claude and the grounding rules decide, the same as the rig, so the refusal comes from the engine, not from a filter in front of it.

## The grounded prompt's three rules

1. **Only the context.** Answer using only the passages provided. No outside or general knowledge, even when the model believes it knows the answer.
2. **Cite the source.** Name the document and section of the passage the answer comes from, copied exactly from that passage's labels.
3. **Refuse exactly.** If the passages don't contain the answer, reply exactly "I don't know", with no source.

The model is claude-opus-5-5, the same as the rig, with the same structured answer (answer, source document, source section).

## The JSON reply

Answered:
```json
{ "question": "...", "answer": "Click \"Undo sale\" in the Sold table…",
  "refused": false,
  "source": { "document": "users-guide.txt", "section": "6. MY COLLECTION › 6.1 Adding a card" },
  "passages": [ { "id": "users-guide-03", "document": "users-guide.txt", "section": "…", "similarity": 0.57 } ] }
```

Refused, which is a normal 200 response, not an error:
```json
{ "question": "...", "answer": "I don't know", "refused": true, "source": null, "passages": [ … ] }
```

Errors:
- 400: a missing, empty or over-500-character question.
- 503: the service isn't set up here (no API key, or no corpus table).
- 502: Claude couldn't be reached or declined to answer.
- 500: anything else.

Error bodies say what went wrong in plain words and never include a key, host or password.

## UI states (on the existing `/search` page)

1. **Idle:** a question box and an "Ask" button, with an example question as the placeholder.
2. **Working:** the button reads "Thinking…" and is disabled. Answers take a few seconds, so this state matters.
3. **Answered:** the answer in plain text, then the receipt underneath: "Source: users-guide.txt · 6. MY COLLECTION › 6.1 Adding a card". Below that, a smaller "What it read" list of the 3 passages with their scores.
4. **Refused, a designed state and not an error:** "That isn't covered in the Ducks on the Pond documents." It suggests rephrasing or contacting support (support@ducksonthepondcards.com), and still shows "What it read". It is styled as a normal answer, not in red.
5. **Error:** a plain message ("Couldn't get an answer right now; try again."), visibly different from the refusal.

A shareable URL (`/search?q=...`) asks the question on load, as search does today.

## Logging

One line per question, `ask.query`, with the question (scrubbed by the existing logger), the 3 retrieved chunk ids and scores, whether it refused, and the cited source. Failures log `ask.failed` with an error code only. **Never the API key, the prompt text or the passages.** The existing `request_done` line records status and time.

## Done when (checked at the live URL)

- **Answered:** "I asked for a second review of an admin's serial-number decision. How long until I hear back?" returns 10 business days with a receipt naming `serial-number-dispute-procedure.txt` (or the accepted Customer Service Policy section). Opening that file shows the 10-day line.
- **Refused:** "What phone number can I call to talk to support?" renders the refused state, not an error and not a phone number.
- **Logged:** the Vercel production log shows `ask.query` for each, with no key or password in it.

## Out of scope

Chat history or follow-up questions, streaming the answer word by word, signing in to ask, and changing the corpus or the chunking.
