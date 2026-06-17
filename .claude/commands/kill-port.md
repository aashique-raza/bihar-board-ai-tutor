Fix the EADDRINUSE port conflict error on Windows.

The port to free is: $ARGUMENTS (default to 5001 if no argument given).

Steps:
1. Run: `netstat -ano | findstr ":<PORT>" | findstr "LISTENING"` to find the PID
2. Parse the last column as PID
3. Run: `taskkill /PID <PID> /F` to kill it
4. Run netstat again to confirm the port is free
5. Tell the user the port is free and they can now run `npm run dev`

Edge cases:
- If multiple PIDs found, kill all of them
- If port is already free, say so and skip killing
- If taskkill says "Access is denied", tell user to reopen terminal as Administrator
