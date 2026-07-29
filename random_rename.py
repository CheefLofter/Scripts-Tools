#!/usr/bin/env python3
"""
random_rename.py

Place this script inside a folder and run it. It will randomly rename
every file in that folder EXCEPT itself. Original file extensions are
preserved; only the filename part is randomized.

Usage:
    python random_rename.py
"""

import os
import random
import string
import sys


def random_name(length=12):
    """Generate a random alphanumeric string."""
    chars = string.ascii_letters + string.digits
    return "".join(random.choices(chars, k=length))


def main():
    # Folder the script lives in (so it works regardless of cwd)
    folder = os.path.dirname(os.path.abspath(__file__))
    script_name = os.path.basename(os.path.abspath(__file__))

    entries = os.listdir(folder)

    # Only files (skip directories), and skip the script itself
    files = [
        f for f in entries
        if os.path.isfile(os.path.join(folder, f)) and f != script_name
    ]

    if not files:
        print("No files to rename (besides this script).")
        return

    print(f"Found {len(files)} file(s) to rename in: {folder}\n")

    used_names = set()

    for old_name in files:
        old_path = os.path.join(folder, old_name)
        ext = os.path.splitext(old_name)[1]  # keep extension

        # Ensure the new random name doesn't collide with an existing
        # or already-chosen filename
        while True:
            new_base = random_name()
            new_name = new_base + ext
            new_path = os.path.join(folder, new_name)
            if new_name not in used_names and not os.path.exists(new_path):
                break

        used_names.add(new_name)
        os.rename(old_path, new_path)
        print(f"  {old_name}  ->  {new_name}")

    print("\nDone.")


if __name__ == "__main__":
    # Simple confirmation prompt to avoid accidental runs
    confirm = input(
        "This will rename ALL files in this folder (except the script). "
        "Continue? [y/N]: "
    ).strip().lower()

    if confirm == "y":
        main()
    else:
        print("Cancelled.")
        sys.exit(0)
