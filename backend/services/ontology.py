import json
from typing import Dict, List, Any, Optional

ONTOLOGIES: Dict[str, Dict[str, Any]] = {
    "crime-analysis-v1": {
        "allowed_entities": {
            "Person": ["name", "DOB", "aliases", "national_id"],
            "Vehicle": ["registration", "make", "model", "owner_name"],
            "Phone": ["number", "IMEI", "carrier"],
            "BankAccount": ["account_number", "institution", "balance"],
            "Organization": ["name", "registration_details"],
            "Evidence": ["type", "collected_date", "custodian"],
            "Crime": ["fir_number", "ipc_sections", "date", "station"],
            "Location": ["name", "address", "coordinates", "district_name", "sub_district_name", "population_total", "population_urban", "literacy_rate", "consumption_index", "facebook_wealth_index"],
            "PoliceStation": ["name", "district", "circle", "coordinates"],
            "Document": ["name", "file_path", "source_type"],
            "Hypothesis": ["name", "status"]
        },
        "allowed_relationships": {
            "registered_owner_of": [("Person", "Vehicle"), ("Person", "Phone"), ("Person", "BankAccount")],
            "family_member_of": [("Person", "Person")],
            "witnessed": [("Person", "Crime")],
            "financial_transfer_to": [("BankAccount", "BankAccount")],
            "seen_with": [("Person", "Person"), ("Person", "Vehicle")],
            "located_at": [("Person", "Location"), ("Crime", "Location"), ("Vehicle", "Location"), ("Crime", "PoliceStation"), ("PoliceStation", "Location")],
            "mentioned_in": [("Person", "Document"), ("Crime", "Document")],
            "same_device_as": [("Phone", "Phone")],
            "called": [("Phone", "Phone")]
        }
    },
    "disaster-response-v1": {
        "allowed_entities": {
            "Incident": ["type", "severity", "status", "reported_at"],
            "Resource": ["name", "type", "quantity", "status"],
            "Shelter": ["name", "capacity", "occupancy", "address"],
            "Responder": ["name", "agency", "role", "contact"],
            "Location": ["name", "address", "coordinates"],
            "Infrastructure": ["name", "type", "status"],
            "Communication": ["sender", "channel", "message", "timestamp"],
            "Document": ["name", "file_path", "source_type"],
            "Hypothesis": ["name", "status"]
        },
        "allowed_relationships": {
            "deployed_to": [("Resource", "Incident"), ("Responder", "Incident")],
            "located_at": [("Resource", "Location"), ("Shelter", "Location"), ("Incident", "Location")],
            "reported_by": [("Incident", "Responder")],
            "affects": [("Incident", "Infrastructure")],
            "sent_to": [("Communication", "Responder")]
        }
    },
    "fraud-investigation-v1": {
        "allowed_entities": {
            "BankAccount": ["account_number", "institution", "risk_score"],
            "Transaction": ["transaction_id", "amount", "timestamp", "type"],
            "Merchant": ["name", "category", "merchant_id"],
            "Customer": ["name", "email", "phone_number"],
            "IPAddress": ["ip", "country", "isp"],
            "Device": ["device_id", "os", "model"],
            "Location": ["name", "address", "coordinates"],
            "Document": ["name", "file_path", "source_type"],
            "Hypothesis": ["name", "status"]
        },
        "allowed_relationships": {
            "belongs_to": [("BankAccount", "Customer"), ("Device", "Customer")],
            "transacted_with": [("BankAccount", "BankAccount"), ("BankAccount", "Merchant")],
            "originated_from": [("Transaction", "IPAddress"), ("Transaction", "Location")],
            "used_device": [("Customer", "Device")],
            "located_at": [("Customer", "Location"), ("Merchant", "Location")]
        }
    }
}

def validate_entity(ontology_version: str, entity_type: str, properties: Dict[str, Any]) -> bool:
    ontology = ONTOLOGIES.get(ontology_version, ONTOLOGIES["crime-analysis-v1"])
    if entity_type not in ontology["allowed_entities"]:
        return False
    # Verify that properties conform to the allowed schema
    allowed_keys = set(ontology["allowed_entities"][entity_type])
    # Also permit general standard keys like 'name', 'description', and 'status'
    allowed_keys.update(["name", "description", "status"])
    for key in properties.keys():
        if key not in allowed_keys:
            return False
    return True

def validate_relationship(ontology_version: str, relationship_type: str, source_type: str, target_type: str) -> bool:
    ontology = ONTOLOGIES.get(ontology_version, ONTOLOGIES["crime-analysis-v1"])
    if relationship_type not in ontology["allowed_relationships"]:
        return False
    allowed_pairs = ontology["allowed_relationships"][relationship_type]
    return (source_type, target_type) in allowed_pairs or (source_type == "Hypothesis" or target_type == "Hypothesis")
