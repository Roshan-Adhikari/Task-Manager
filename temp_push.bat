@echo off
set GIT="C:\Program Files\Git\cmd\git.exe"
%GIT% add .
%GIT% commit -m "Add instant email alerts for task assignments"
%GIT% push origin main
echo Done!
