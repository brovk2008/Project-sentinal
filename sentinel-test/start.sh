#!/bin/sh
python3 -m pip install --no-cache-dir -r requirements.txt
exec python3 main.py
