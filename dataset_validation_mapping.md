# Project Sentinel: Dataset Validation and Mapping Document

This document presents a comprehensive audit, validation, mapping schema, and intelligence enrichment design for all raw data and PDFs downloaded in the workspace. It prepares the system for code-level implementation of Phase 1.

---

## 1. Structural In-Depth Inspection of All Datasets

Based on our programmatic audit of the raw workspace files, here is the structural profile of the datasets:

### 1.1 Core Datasets

#### 1. FIR Details
*   **File Name**: `fir-details-karnataka-police/FIR_Details_Data.csv`
*   **File Size**: 546.15 MB
*   **Number of Rows**: 1,674,734
*   **Number of Columns**: 34
*   **Column Names & Data Types**:
    *   `District_Name` (str), `UnitName` (str), `FIR_YEAR` (int64), `FIR_MONTH` (int64), `Offence_Duration` (int64), `FIR_Day` (int64)
    *   `FIR Type` (str), `FIR_Stage` (str), `Complaint_Mode` (str), `CrimeGroup_Name` (str), `CrimeHead_Name` (str)
    *   `Latitude` (float64), `Longitude` (float64), `ActSection` (str), `IOName` (str), `KGID` (object)
    *   `Internal_IO` (int64), `Place of Offence` (str), `Distance from PS` (str), `Beat_Name` (str), `Village_Area_Name` (str)
    *   `Male` (int64), `Female` (int64), `Boy` (int64), `Girl` (int64), `Age 0` (int64)
    *   `VICTIM COUNT` (int64), `Accused Count` (int64)
    *   `Arrested Male` (int64), `Arrested Female` (int64), `Arrested Count\tNo.` (int64)
    *   `Accused_ChargeSheeted Count` (int64), `Conviction Count` (int64), `Unit_ID` (int64)
*   **Missing Value Percentages**:
    *   `Latitude`: 68.24%
    *   `Longitude`: 68.24%
    *   All other columns: 0.00%
*   **Duplicate Percentage**: 0.78% (Estimated from sample)

#### 2. Financial Fraud Detection Dataset
*   **File Name**: `financial-transactions-dataset-for-fraud-detection/financial_fraud_detection_dataset.csv`
*   **File Size**: 759.17 MB
*   **Number of Rows**: 5,000,000
*   **Number of Columns**: 18
*   **Column Names & Data Types**:
    *   `transaction_id` (str), `timestamp` (str), `sender_account` (str), `receiver_account` (str), `amount` (float64)
    *   `transaction_type` (str), `merchant_category` (str), `location` (str), `device_used` (str), `is_fraud` (bool)
    *   `fraud_type` (str), `time_since_last_transaction` (float64), `spending_deviation_score` (float64)
    *   `velocity_score` (int64), `geo_anomaly_score` (float64), `payment_channel` (str), `ip_address` (str), `device_hash` (str)
*   **Missing Value Percentages**:
    *   `fraud_type`: 99.76% (only populated for fraud transactions)
    *   `time_since_last_transaction`: 94.69%
    *   All other columns: 0.00%
*   **Duplicate Percentage**: 0.00%

#### 3. PaySim log Dataset
*   **File Name**: `paysim1/PS_20174392719_1491204439457_log.csv`
*   **File Size**: 470.67 MB
*   **Number of Rows**: 6,362,620
*   **Number of Columns**: 11
*   **Column Names & Data Types**:
    *   `step` (int64), `type` (str), `amount` (float64), `nameOrig` (str), `oldbalanceOrg` (float64), `newbalanceOrig` (float64)
    *   `nameDest` (str), `oldbalanceDest` (float64), `newbalanceDest` (float64), `isFraud` (int64), `isFlaggedFraud` (int64)
*   **Missing Value Percentages**: All columns: 0.00%
*   **Duplicate Percentage**: 0.00%

#### 4. CDR Data & Situation 1
*   **File Names**:
    *   `CDR-Generator/results/cdr_data.csv` (0.63 MB, 11,912 rows)
    *   `CDR-Generator/results/cdr_situation1.csv` (1.16 MB, 21,964 rows)
*   **Number of Columns**: 6
*   **Column Names & Data Types**:
    *   `Caller id` (int64), `Caller company` (str), `Receiver id` (int64), `Receiver company` (str), `Timestamp` (str), `Duration s.` (int64)
*   **Missing Value Percentages**: All columns: 0.00%
*   **Duplicate Percentage**: 0.00%

---

### 1.2 Enrichment Datasets

#### 1. Literacy Data 2011
*   **File Name**: `india-literacy-data-district-wise/Literacy Data 2011.csv`
*   **File Size**: 0.02 MB
*   **Number of Rows**: 640
*   **Number of Columns**: 4
*   **Column Names & Data Types**:
    *   `Unnamed: 0` (int64), `District` (str), `State` (str), `Literacy` (float64)
*   **Missing Value Percentages**: 0.00%
*   **Duplicate Percentage**: 0.00%

#### 2. Indian Vehicle Registration Data (Aggregated & 500k Sample)
*   **File Name**: `indian-vehicle-registration-data-202025/vehicle_registrations_500k.csv`
*   **File Size**: 78.04 MB
*   **Number of Rows**: 500,000
*   **Number of Columns**: 15
*   **Column Names & Data Types**:
    *   `registrationYear` (int64), `financialYear` (str), `registrationMonthMMYY` (str), `makerName` (str), `stateName` (str)
    *   `rtoCode` (str), `rtoName` (str), `vehicleCategoryName` (str), `vehicleModelName` (str), `fuelName` (str)
    *   `vehicleClassName` (str), `grossVehicleWeight` (int64), `pollutionNorm` (str), `saleType` (str), `vehicleCount` (int64)
*   **Missing Value Percentages**: 0.00%
*   **Duplicate Percentage**: 0.00%

#### 3. RBI Branch Directory
*   **File Name**: `SHRUG RBI/SHRUG RBI/data/rbi_directory_shrid.csv`
*   **File Size**: 38.87 MB
*   **Number of Rows**: 154,505
*   **Number of Columns**: 20
*   **Column Names & Data Types**:
    *   `shrid2` (str), `pc11_state_id` (int64), `pc11_district_id` (float64), `pc11_village_id` (float64), `pc11_town_id` (float64)
    *   `rbi_serial_number` (float64), `rbi_region` (str), `rbi_bank_group` (str), `rbi_bank` (str), `rbi_branch` (str)
    *   `rbi_part1code` (str), `rbi_part2code` (str), `rbi_pincode` (float64), `rbi_population_group` (str)
    *   `rbi_date_of_open` (str), `rbi_ad_category` (str), `rbi_license_no` (str), `rbi_license_date` (str)
    *   `rbi_address` (str), `rbi_branch_office` (str)
*   **Missing Value Percentages**:
    *   `shrid2`: 13.97%, `rbi_pincode`: 13.16%, `rbi_ad_category`: 59.97%, `rbi_license_no`: 30.77%, `rbi_license_date`: 30.61%

#### 4. Facebook Wealth Index (District-wise)
*   **File Name**: `shrug-facebook-rwi-csv/facebook_rwi_pc11dist.csv`
*   **File Size**: 0.07 MB
*   **Number of Rows**: 640
*   **Number of Columns**: 10
*   **Column Names & Data Types**:
    *   `pc11_district_id` (int64), `pc11_state_id` (int64), `facebook_mean_rwi` (float64), `facebook_min_rwi` (float64), `facebook_max_rwi` (float64)
*   **Missing Value Percentages**: 0.00%

#### 5. VIIRS Nightlights (District-wise Annual)
*   **File Name**: `shrug-viirs-annual-csv/viirs_annual_pc11dist.csv`
*   **File Size**: 1.53 MB
*   **Number of Rows**: 15,360
*   **Number of Columns**: 9
*   **Column Names & Data Types**:
    *   `pc11_district_id` (int64), `pc11_state_id` (int64), `viirs_annual_mean` (float64), `year` (int64)
*   **Missing Value Percentages**: 0.00%

#### 6. SECC Consumption (Rural District-wise)
*   **File Name**: `shrug-secc-cons-rural-csv/secc_cons_rural_pc11dist.csv`
*   **File Size**: 0.07 MB
*   **Number of Rows**: 615
*   **Number of Columns**: 10
*   **Column Names & Data Types**:
    *   `pc11_district_id` (int64), `pc11_state_id` (int64), `secc_cons_rural` (float64), `secc_cons_pc_rural` (float64), `secc_pov_rate_rural` (float64)
*   **Missing Value Percentages**: 0.00%

#### 7. Census Population PCA
*   **File Name**: `pc11_pca_clean_pc11dist.csv`
*   **File Size**: 0.31 MB
*   **Number of Rows**: 640
*   **Number of Columns**: 87
*   **Column Names & Data Types**:
    *   `pc11_state_id` (int64), `pc11_district_id` (int64), `pc11_pca_tot_p` (int64), `pc11_pca_tot_m` (int64), `pc11_pca_tot_f` (int64), `pc11_pca_p_lit` (int64)
*   **Missing Value Percentages**: 0.00%

---

## 2. Dataset-to-Schema Mapping Document

Here is the precise mapping from source datasets to the final PostgreSQL + PostGIS schema:

| Target Table | Source Dataset | Source Column | Target Column | Required Transformation | Missing / Synthesized |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`dim_police_units`** | FIR Details | `Unit_ID`<br>`UnitName`<br>`District_Name` | `unit_id`<br>`unit_name`<br>`district_name` | Clean spacing, standard capitalization, check for name mismatches. | `latitude`, `longitude` (Synthesized using beat/station centroids if unavailable) |
| **`dim_geography`** | FIR Details + India Geodata | `Village_Area_Name`<br>`Beat_Name`<br>`District_Name` | `village_area_name`<br>`beat_name`<br>`district_name` | Build composite spatial key `geo_id`. Standardize District Names. | `geom` (Parsed from local KML/JSON boundary datasets) |
| **`dim_crime_classification`**| FIR Details | `CrimeGroup_Name`<br>`CrimeHead_Name` | `crime_group_name`<br>`crime_head_name` | Deduplicate and create sequential serial key. | None |
| **`dim_demographics`** | Census + Literacy + SECC + FB RWI | `pc11_district_id`<br>`pc11_pca_tot_p`<br>`Literacy`<br>`facebook_mean_rwi`<br>`secc_cons_rural` | `geo_id`<br>`population_total`<br>`literacy_rate`<br>`facebook_wealth_index`<br>`consumption_index` | Resolve `pc11_district_id` to Karnataka administrative district names. | Map `District` names in Literacy to `District_Name` in FIR. |
| **`dim_financial_accounts`** | PaySim + Fraud | `nameOrig`<br>`nameDest`<br>`sender_account`<br>`receiver_account` | `account_number`<br>`owner_citizen_id`<br>`bank_name` | Read all distinct accounts and upsert records. | `owner_citizen_id` (Synthesized via hashing), `bank_name` (randomly assigned from RBI bank list) |
| **`dim_vehicles`** | Indian Vehicle Registrations | `registrationMonthMMYY`<br>`makerName`<br>`vehicleCategoryName`<br>`vehicleModelName` | `registration_number`<br>`owner_citizen_id`<br>`vehicle_make`<br>`vehicle_category` | Filter `stateName = 'Karnataka'` or fallback to RTO code parsing (e.g. KA-01). | `owner_citizen_id` (Synthesized) |
| **`fact_fir_events`** | FIR Details | `District_Name` + `UnitName` + `FIR_YEAR` + `FIR_number`<br>`FIR_YEAR` / `FIR_MONTH` / `FIR_Day`<br>`Latitude`<br>`Longitude` | `fir_id`<br>`fir_date`<br>`latitude`<br>`longitude`<br>`geom` | Parse composite primary key. Combine date integers. Construct PostGIS point geometry `ST_SetSRID(ST_Point(lon, lat), 4326)`. | `geo_id` (derived from spatial intersection or beat name matches) |
| **`fact_financial_transactions`**| PaySim + Fraud | `transaction_id`<br>`timestamp`<br>`amount`<br>`is_fraud` | `transaction_id`<br>`timestamp`<br>`amount`<br>`is_fraud` | If PaySim, map relative `step` to timestamp. Convert boolean flags to standard SQL boolean. | None |
| **`fact_call_detail_records`**| CDR Generator | `Caller id`<br>`Receiver id`<br>`Timestamp`<br>`Duration s.` | `caller_number`<br>`receiver_number`<br>`call_timestamp`<br>`duration_seconds` | Convert caller/receiver IDs into 10-digit phone strings. Parse timestamps. | `cell_tower_id` (Synthesized matching region mapping) |

---

## 3. Identification of Schema Mismatches

1.  **District Naming Discrepancies**:
    *   *Mismatch*: Literacy dataset has district names in Title case (e.g., `"Bangalore"`). The FIR dataset has mixed naming (e.g., `"Bangalore City"`, `"Bangalore District"`).
    *   *Resolution*: The ETL pipeline will use a district canonical lookup map to resolve all variants to standard Karnataka State Police administrative districts (e.g., `"BENGALURU CITY"`, `"BENGALURU DISTRICT"`, `"BAGALKOT"`).
2.  **Missing Coordinates in FIR Records (68.24%)**:
    *   *Mismatch*: Only ~31% of the 1.67M FIR records contain coordinate values.
    *   *Resolution*: When `Latitude` and `Longitude` are null, we will fall back to resolving coordinates using the geographic centroid of the `Village_Area_Name` or `Beat_Name`. If those are also missing, we fall back to the handling police station's (`UnitName`) coordinate centroid.
3.  **Missing Global Citizen IDs**:
    *   *Mismatch*: The vehicle registration and fraud datasets do not share a common citizen/person key with the FIR dataset.
    *   *Resolution*: Suspect and fraud networks will be represented using **Account Numbers** and **Phone Numbers** as graph nodes rather than citizen entities, bypassing the unmapped citizen mismatch.
4.  **PaySim Time Mismatch**:
    *   *Mismatch*: PaySim uses relative `step` integer markers (1 step = 1 hour) instead of datetime timestamps.
    *   *Resolution*: Map `step` relative to an arbitrary epoch start (e.g., `2024-01-01 00:00:00` + `step * 1 Hour`).

---

## 4. Identification of Data Quality Issues

1.  **High Rate of Null Coordinates in FIR**:
    *   68.24% null coordinates require spatial imputation to prevent hotspots from looking empty.
2.  **Inconsistent ActSection Formatting**:
    *   The `ActSection` column contains long raw string sequences (e.g., `"PROTECTION OF CHILDREN FROM SEXUAL OFFENCES ACT 2012 U/s: 12 IPC 1860 U/s: 306"`). We must parse this into structured arrays (Acts vs. Sections) to query by crime category.
3.  **Financial Fraud Types Skew**:
    *   The `fraud_type` column is null for 99.76% of transactions. This is expected since most transactions are benign, but requires SQL handling (imputing to `'NONE'`).
4.  **Duplicate FIR Entries (0.78%)**:
    *   Duplicates occur due to data entry shifts or revised FIR uploads. The ETL pipeline must deduplicate records using a composite key: `(District_Name, UnitName, FIR_YEAR, Unit_ID, FIR_number)`.

---

## 5. Master Data Inventory

### CORE DATASETS (Sourced from Police & Telecom Logs)
*   `FIR_Details_Data.csv` (Primary Spatial-Temporal Crime logs)
*   `financial_fraud_detection_dataset.csv` (Simulated high-dimensional fraud)
*   `PS_20174392719_1491204439457_log.csv` (High-volume PaySim transaction records)
*   `cdr_data.csv` / `cdr_situation1.csv` (Call logs linking suspects)
*   `india-geodata/` (KML boundaries for mapping)

### ENRICHMENT DATASETS (Sourced from Census & Remote Sensing)
*   `Literacy Data 2011.csv` (District-wise education rates)
*   `pc11_pca_clean_pc11dist.csv` (Census population density profiles)
*   `secc_cons_rural_pc11dist.csv` (Socio-economic consumption rates)
*   `facebook_rwi_pc11dist.csv` (Facebook Relative Wealth Index)
*   `viirs_annual_pc11dist.csv` (Night light radiance values)
*   `vehicle_registrations_500k.csv` (Indian vehicle details)
*   `rbi_directory_shrid.csv` (Bank branch density indices)

### KNOWLEDGE DATASETS (PDF Legal and Procedural Texts)
*   `CrimeinIndia2024-VolumeI1.pdf`, `2CrimeinIndia2024-VolumeII.pdf`, `3CrimeinIndia2024-VolumeIII1.pdf`
*   `ACID ATTACK.pdf`, `Human Trafficking.pdf`, `Medical Professionals.pdf`, `Organised crime.pdf`, `Proclaimed Offender.pdf`, `SEXUAL HARASSMENST.pdf`, `Snatching.pdf`, `Technology.pdf`, `Terrorism.pdf`, `Stakehoder Driven Reforms corrected.pdf`

---

## 6. Intelligence Enrichment Design

We integrate all available secondary datasets into the analytics and forecasting modules:

```
[Secondary Datasets]
  ├── Night Lights (VIIRS) & Facebook RWI ----> Sociological Crime Insights
  ├── Census (Pop Density) & SECC Rural ------> Predictive Crime Forecasting
  ├── RBI Branches & Vehicle Regs ------------> Risk-Scoring Engine
```

### 6.1 Integration into Sociological Crime Insights
*   **Methodology**: Run correlation coefficients between crime rates (calculated per 100k population using Census total population) and economic proxies (Facebook Wealth Index, Night Light radiance, and SECC poverty rates).
*   **Insight Generation**: Detect "Economic-Crime Hubs" (high wealth index combined with high commercial theft/fraud) vs. "Poverty-Crime Hotspots" (high poverty rates and high violent crime).

### 6.2 Integration into Predictive Forecasting
*   **Methodology**: Use demographic attributes as static features in spatial-temporal forecasting models (such as Random Forest regressors).
*   **Feature Matrices**: Every geographic zone (District/H3 Grid) is enriched with literacy rates, poverty rates, population density, and wealth indices. The forecasting model uses these features to predict crime risk trends in areas experiencing rapid changes (e.g. rising night light radiance indicating urban growth).

### 6.3 Integration into Risk Scoring & Resource Allocation
*   **RBI Bank Branches**: Identify regions with a low density of bank branches ("Unbanked pockets") compared to high transaction velocities in Call Detail Records. This flags potential cash-mule operations.
*   **Vehicle Registrations**: Cross-reference RTO registration codes (e.g., KA-51) and vehicle types with local theft occurrences to flags models and vehicle segments at high risk of vehicle-related offences.

---

## 7. Data Readiness Report

This report evaluates dataset readiness for engineering:

*   **Ready Immediately (Direct Load)**:
    *   `Literacy Data 2011.csv` (Low cleaning overhead)
    *   `cdr_data.csv` & `cdr_situation1.csv` (Clean phone calling relationships)
    *   `facebook_rwi_pc11dist.csv` (Standardized district IDs)
    *   `secc_cons_rural_pc11dist.csv` (Normalized rates ready)
*   **Needs In-depth Cleaning (P0 priority)**:
    *   `FIR_Details_Data.csv`: Must deduplicate, clean name spelling variants, and parse `ActSection` arrays.
    *   `vehicle_registrations_500k.csv`: Must filter records containing invalid/corrupted categories.
*   **Needs Spatial Transformation (P0 priority)**:
    *   `FIR_Details_Data.csv`: Must resolve missing coordinates (68.24% null) via centroid lookups, then construct PostGIS spatial geometries.
    *   `PS_20174392719_1491204439457_log.csv`: Must map relative `step` integers to calendar dates.
*   **Optional (Delay to Post-MVP)**:
    *   `rbi_directory_shrid.csv`: High null rate in licensing data; optional branch density mapping.
*   **Competitive Advantage (High impact for Judges)**:
    *   `viirs_annual_pc11dist.csv` (Night light radiance) + `facebook_rwi_pc11dist.csv`: Integrating remote sensing and Facebook wealth data provides the judges with a highly premium, data-enriched demographic profiling dashboard.
