import sys
import traceback

print("Initializing local debug...")
try:
    from db import db_client
    from routes.ai import get_crime_patterns, get_anomalies_feed
    
    print("\n1. Testing get_crime_patterns()...")
    try:
        patterns = get_crime_patterns()
        print("Success! Return length of stations:", len(patterns.get("stations", [])))
    except Exception as e:
        print("FAIL get_crime_patterns():")
        traceback.print_exc()

    print("\n2. Testing get_anomalies_feed()...")
    try:
        anomalies = get_anomalies_feed()
        print("Success! Return length of anomalies:", len(anomalies))
    except Exception as e:
        print("FAIL get_anomalies_feed():")
        traceback.print_exc()

except Exception as e:
    print("Startup error during import:")
    traceback.print_exc()
