import sys
import json
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/set_active_env.py <idx>")
        sys.exit(1)
        
    try:
        idx = int(sys.argv[1])
    except ValueError:
        print("Error: idx must be an integer (1, 2, or 3)")
        sys.exit(1)
        
    rc_path = ".catalystrc"
    
    if not os.path.exists(rc_path):
        print(f"Error: {rc_path} not found")
        sys.exit(1)
        
    with open(rc_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    # Ensure actives and env keys exist
    if "actives" not in data:
        data["actives"] = {}
    data["actives"]["env"] = idx
    
    # Save the updated .catalystrc file back
    with open(rc_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        
    print(f"Successfully set active environment to idx {idx} in .catalystrc")

if __name__ == "__main__":
    main()
