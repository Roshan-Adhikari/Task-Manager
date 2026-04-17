@echo off
set GIT="C:\Program Files\Git\cmd\git.exe"
%GIT% add public/index.html public/app.js
%GIT% commit -m "Update: Allow assigning tasks directly by email"
%GIT% push -u origin main
echo Done!
pause
