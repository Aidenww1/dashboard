' Starts aw-bridge.mjs in --loop mode HIDDEN (no console window).
' Used for auto-start at login (Startup folder or Task Scheduler).
' Requires Node on PATH and ActivityWatch running.
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' 0 = hidden window, False = don't wait
sh.Run "cmd /c node aw-bridge.mjs --loop", 0, False
