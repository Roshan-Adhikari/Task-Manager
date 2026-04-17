@echo off
set GIT="C:\Program Files\Git\cmd\git.exe"
%GIT% init
%GIT% config user.email "roshan.adhikari@masaischool.com"
%GIT% config user.name "Roshan-Adhikari"
%GIT% add .
%GIT% status
%GIT% commit -m "Initial commit: TaskFlow backend with SQLite, Google OAuth, email reminders"
%GIT% branch -M main
%GIT% remote add origin https://github.com/Roshan-Adhikari/Task-Manager.git
%GIT% push -u origin main
echo Done!
