Start (or restart) the dev server for the Bihar Board AI Tutor project. Show startup logs directly in this chat so the user can confirm the server is running.

Argument: $ARGUMENTS — "frontend", "backend", or "both" (case-insensitive).
If missing, ask: "frontend chalana hai ya backend?"

---

## Port & directory map

| Target   | Port | Absolute path                                                |
|----------|------|--------------------------------------------------------------|
| backend  | 5001 | C:\Users\devel\Desktop\bihar-board-ai-tutor\backend         |
| frontend | 5173 | C:\Users\devel\Desktop\bihar-board-ai-tutor\frontend        |

---

## Steps — follow these exactly

### Step 1 — Kill the port if occupied

Run in PowerShell:
```
netstat -ano | findstr ":<PORT>" | findstr "LISTENING"
```
- PID found → `taskkill /PID <PID> /F` — confirm killed
- Nothing found → already free, skip

### Step 2 — Start the server in background

Use the Bash tool with **`run_in_background: true`** to start the server:

```bash
cd "C:\Users\devel\Desktop\bihar-board-ai-tutor\<backend or frontend>" && npm run dev
```

Set `run_in_background: true` so the terminal doesn't block. You will get a background task ID back.

### Step 3 — Stream logs with Monitor

Immediately after starting, use the **Monitor tool** on the background task to stream its output. Keep monitoring until you see one of these confirmation lines:

- Backend: `Server running` or `listening on port` or `nodemon` started
- Frontend: `Local:` or `ready in` or `VITE` or port number appears

Once you see the confirmation, stop monitoring and report to the user.

### Step 4 — Report clearly

Tell the user:
- Server naam (backend / frontend)
- Port number
- Key log line that confirms it's running (copy the actual line from logs)
- Server ab background mein chal raha hai — logs dekhne ke liye VS Code terminal mein `npm run dev` manually mat chalao

Example:
```
Backend server start ho gaya ✓
Port: 5001
Log: [nodemon] starting `node src/server.js`
      Server running on port 5001

Server background mein chal raha hai.
```

---

## "both" — start dono

If argument is "both" or "all":
1. Kill port 5001 → start backend (background) → stream logs → confirm
2. Kill port 5173 → start frontend (background) → stream logs → confirm
3. Report both together

Start them sequentially (backend first, then frontend) so logs don't mix.

---

## Errors

**Access denied on taskkill** → VS Code ko Administrator ke roop mein kholo.
**npm not found in bash** → Try `npm.cmd run dev` instead.
**nodemon not found** → Run `npm install` in backend folder first.
**Port still occupied after kill** → Wait 2 seconds and check again with netstat.
