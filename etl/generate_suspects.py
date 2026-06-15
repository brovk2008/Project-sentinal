import os
import random
import logging
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger("generate_suspects")

import os
DB_URL = os.getenv("DATABASE_URL")

FIRST_NAMES = [
    "Amit", "Rahul", "Vijay", "Rajesh", "Anil", "Suresh", "Vikram", "Ramesh", "Sunil", "Karan",
    "Prakash", "Sanjay", "Deepak", "Manoj", "Arun", "Srinivas", "Manjunath", "Venkatesh", "Ravi", "Sandesh",
    "Ajay", "Alok", "Anand", "Chethan", "Ganesh", "Harish", "Kiran", "Naveen", "Pradeep", "Raghu",
    "Santosh", "Satish", "Shashi", "Umesh", "Vinay", "Abhishek", "Darshan", "Lokesh", "Karthik", "Puneeth"
]

LAST_NAMES = [
    "Kumar", "Patil", "Gowda", "Shetty", "Naidu", "Joshi", "Bhat", "Rao", "Hegde", "Reddy",
    "Singh", "Sharma", "Verma", "Gupta", "Desai", "Kulkarni", "Prasad", "Nayak", "Pujari", "Acharya",
    "Jadhav", "Chavan", "Siddappa", "Hiremath", "Goudar", "Murthy", "Ranganath", "Nagaraj", "Babu", "Pinto"
]

GENDERS = ["Male"] * 92 + ["Female"] * 8

def generate_suspect_pool(num_suspects=25000):
    LOGGER.info(f"Generating {num_suspects} unique suspects...")
    suspects = []
    for i in range(num_suspects):
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        if random.random() < 0.1:
            name += f" @ {random.choice(FIRST_NAMES)}" # alias
        age = random.randint(18, 70)
        gender = random.choice(GENDERS)
        suspects.append((name, age, gender))
    return suspects

def populate_suspects():
    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    try:
        LOGGER.info("Clearing old suspect data...")
        cursor.execute("TRUNCATE dim_suspects, rel_fir_suspects CASCADE;")
        conn.commit()

        # Fetch active FIRs where accused count > 0 (Limit to 150k for performance and density)
        LOGGER.info("Fetching FIR records with accused...")
        cursor.execute("""
            SELECT f.fir_id, f.accused_count, f.geo_id, cc.crime_group_name 
            FROM fact_fir_events f
            JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
            WHERE f.accused_count > 0 
            ORDER BY f.fir_date DESC 
            LIMIT 150000;
        """)
        firs = cursor.fetchall()
        LOGGER.info(f"Fetched {len(firs)} FIRs.")

        if not firs:
            LOGGER.warning("No FIRs found with accused_count > 0.")
            return

        # Generate suspects
        num_suspects = 20000
        sus_pool = generate_suspect_pool(num_suspects)
        
        # Insert suspects and get their IDs
        LOGGER.info("Inserting suspects into dim_suspects...")
        insert_suspect_sql = """
            INSERT INTO dim_suspects (name, age, gender, primary_mo, recidivism_risk)
            VALUES %s RETURNING suspect_id;
        """
        # Prepare suspect data
        sus_data = []
        for name, age, gender in sus_pool:
            # We will fill primary_mo and risk later, insert defaults first
            sus_data.append((name, age, gender, 'None', 'LOW'))
            
        execute_values(cursor, insert_suspect_sql, sus_data)
        cursor.execute("SELECT suspect_id FROM dim_suspects;")
        suspect_ids = [r[0] for r in cursor.fetchall()]
        LOGGER.info(f"Inserted {len(suspect_ids)} suspects.")

        # Designate 15% as repeat offenders, 2% as high-rate habitual offenders
        num_repeats = int(num_suspects * 0.15)
        num_habitual = int(num_suspects * 0.02)
        
        repeat_suspects = suspect_ids[:num_repeats]
        habitual_suspects = suspect_ids[num_repeats:num_repeats+num_habitual]
        single_suspects = suspect_ids[num_repeats+num_habitual:]

        # Map suspects to FIRs
        # rel_fir_suspects: (fir_id, suspect_id, role)
        relations = []
        suspect_mo_map = {} # suspect_id -> list of crime groups
        suspect_fir_count = {} # suspect_id -> count

        # To ensure repeat and habitual offenders commit multiple crimes:
        # We loop through FIRs and assign suspects.
        for fir_id, accused_count, geo_id, crime_group in firs:
            # For each accused slot in this FIR
            accused_count = min(accused_count, 5) # limit accused per FIR to 5 for sanity
            for _ in range(accused_count):
                r = random.random()
                if r < 0.15 and repeat_suspects:
                    sus_id = random.choice(repeat_suspects)
                elif r < 0.20 and habitual_suspects:
                    sus_id = random.choice(habitual_suspects)
                else:
                    sus_id = random.choice(single_suspects)

                relations.append((fir_id, sus_id, 'Accused'))
                
                # Track crime group for MO
                if sus_id not in suspect_mo_map:
                    sus_id_mo = []
                    suspect_mo_map[sus_id] = sus_id_mo
                suspect_mo_map[sus_id].append(crime_group)
                suspect_fir_count[sus_id] = suspect_fir_count.get(sus_id, 0) + 1

        # Deduplicate relations to enforce primary key (fir_id, suspect_id)
        deduped_relations = list(set(relations))
        LOGGER.info(f"Inserting {len(deduped_relations)} FIR-Suspect relationships...")

        insert_rel_sql = """
            INSERT INTO rel_fir_suspects (fir_id, suspect_id, role)
            VALUES %s ON CONFLICT (fir_id, suspect_id) DO NOTHING;
        """
        # Execute in chunks
        chunk_size = 50000
        for i in range(0, len(deduped_relations), chunk_size):
            chunk = deduped_relations[i:i+chunk_size]
            execute_values(cursor, insert_rel_sql, chunk)

        # Update primary_mo and risk score in dim_suspects based on their activity
        LOGGER.info("Updating primary MO and risk classification in dim_suspects...")
        update_data = []
        for s_id, crimes in suspect_mo_map.items():
            # primary MO is the most common crime group
            primary_mo = max(set(crimes), key=crimes.count)
            count = suspect_fir_count[s_id]
            if count >= 5:
                risk = 'HIGH'
            elif count >= 2:
                risk = 'MEDIUM'
            else:
                risk = 'LOW'
            update_data.append((primary_mo, risk, s_id))

        update_sql = """
            UPDATE dim_suspects 
            SET primary_mo = %s, recidivism_risk = %s 
            WHERE suspect_id = %s;
        """
        for primary_mo, risk, s_id in update_data:
            cursor.execute(update_sql, (primary_mo, risk, s_id))

        conn.commit()
        LOGGER.info("Suspect data generation and updates completed successfully.")

    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Error during suspect population: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    populate_suspects()
