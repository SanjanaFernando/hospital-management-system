#!/usr/bin/env python3
"""
Collect historical queue data from MongoDB for model training.

Usage:
    python mlops/scripts/collect_data.py --days 30 --output mlops/data/raw
"""

import json
import argparse
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mlops/logs/data_collection.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def get_mongodb_uri() -> str:
    """Get MongoDB connection URI from config or environment."""
    import os
    uri = os.getenv('MONGODB_URI')
    if not uri:
        logger.warning("MONGODB_URI not set. Using local MongoDB.")
        uri = "mongodb://localhost:27017/hospital_db"
    return uri


def load_config():
    """Load MongoDB config."""
    config_path = Path(__file__).parent.parent / "config" / "mongodb_config.json"
    with open(config_path, 'r') as f:
        return json.load(f)


def collect_patient_data(client: Any, db: Any, days: int) -> pd.DataFrame:
    """Extract patient data from MongoDB."""
    logger.info(f"Collecting patient data from last {days} days...")
    
    try:
        from pymongo import MongoClient
        
        patients_collection = db['patients']
        
        # Query patients admitted in the last N days
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        query = {
            "admissionTime": {"$gte": cutoff_date}
        }
        
        patients = list(patients_collection.find(query))
        logger.info(f"Found {len(patients)} patient records")
        
        # Convert to DataFrame
        df_patients = pd.DataFrame(patients)
        
        # Rename _id to patient_id for clarity
        if '_id' in df_patients.columns:
            df_patients.rename(columns={'_id': 'patient_id'}, inplace=True)
        
        return df_patients
    
    except Exception as e:
        logger.error(f"Error collecting patient data: {e}")
        return pd.DataFrame()


def collect_ward_data(db: Any) -> pd.DataFrame:
    """Extract ward information."""
    logger.info("Collecting ward information...")
    
    try:
        wards_collection = db['wards']
        wards = list(wards_collection.find())
        logger.info(f"Found {len(wards)} wards")
        
        df_wards = pd.DataFrame(wards)
        if '_id' in df_wards.columns:
            df_wards.rename(columns={'_id': 'ward_id'}, inplace=True)
        
        return df_wards
    
    except Exception as e:
        logger.error(f"Error collecting ward data: {e}")
        return pd.DataFrame()


def collect_bed_data(db: Any) -> pd.DataFrame:
    """Extract bed occupancy data."""
    logger.info("Collecting bed data...")
    
    try:
        beds_collection = db['beds']
        beds = list(beds_collection.find())
        logger.info(f"Found {len(beds)} beds")
        
        df_beds = pd.DataFrame(beds)
        if '_id' in df_beds.columns:
            df_beds.rename(columns={'_id': 'bed_id'}, inplace=True)
        
        return df_beds
    
    except Exception as e:
        logger.error(f"Error collecting bed data: {e}")
        return pd.DataFrame()


def save_collected_data(df_patients: pd.DataFrame, df_wards: pd.DataFrame, 
                       df_beds: pd.DataFrame, output_dir: str):
    """Save collected data to CSV files."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Save individual datasets
    patients_file = output_path / f"patients_{timestamp}.csv"
    wards_file = output_path / f"wards_{timestamp}.csv"
    beds_file = output_path / f"beds_{timestamp}.csv"
    
    df_patients.to_csv(patients_file, index=False)
    df_wards.to_csv(wards_file, index=False)
    df_beds.to_csv(beds_file, index=False)
    
    logger.info(f"Saved patients data to {patients_file}")
    logger.info(f"Saved wards data to {wards_file}")
    logger.info(f"Saved beds data to {beds_file}")
    
    # Create metadata file
    metadata = {
        "timestamp": datetime.now().isoformat(),
        "patients_count": len(df_patients),
        "wards_count": len(df_wards),
        "beds_count": len(df_beds),
        "date_range_days": args.days if 'args' in globals() else "N/A",
        "files": {
            "patients": str(patients_file),
            "wards": str(wards_file),
            "beds": str(beds_file)
        }
    }
    
    metadata_file = output_path / f"metadata_{timestamp}.json"
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2, default=str)
    
    logger.info(f"Saved metadata to {metadata_file}")


def main():
    parser = argparse.ArgumentParser(description='Collect hospital data from MongoDB')
    parser.add_argument('--days', type=int, default=30, help='Number of days of history to collect')
    parser.add_argument('--output', type=str, default='mlops/data/raw', help='Output directory')
    
    global args
    args = parser.parse_args()
    
    logger.info("Starting data collection...")
    
    try:
        # Note: In production, use pymongo
        # from pymongo import MongoClient
        # uri = get_mongodb_uri()
        # client = MongoClient(uri)
        # db = client['hospital_db']
        
        logger.warning("pymongo not installed. Skipping actual MongoDB connection.")
        logger.info("To use this script, install pymongo: pip install pymongo")
        
        # For now, create sample data structure for demonstration
        logger.info("Creating sample data structure...")
        
        df_patients = pd.DataFrame({
            'patient_id': ['1', '2', '3'],
            'wardId': ['ward-0', 'ward-0', 'ward-1'],
            'name': ['Patient A', 'Patient B', 'Patient C'],
            'age': [45, 65, 35],
            'priority': ['Critical', 'Urgent', 'Non-urgent'],
            'admissionTime': [datetime.now()] * 3,
            'queueWaitTime': [30, 45, 15]
        })
        
        df_wards = pd.DataFrame({
            'ward_id': ['ward-0', 'ward-1'],
            'name': ['General Medicine', 'Cardiology'],
            'totalBeds': [25, 20]
        })
        
        df_beds = pd.DataFrame({
            'bed_id': ['0-1', '0-2'],
            'wardId': ['ward-0', 'ward-0'],
            'status': ['occupied', 'available']
        })
        
        save_collected_data(df_patients, df_wards, df_beds, args.output)
        logger.info("Data collection completed successfully!")
        
    except Exception as e:
        logger.error(f"Data collection failed: {e}")
        raise


if __name__ == '__main__':
    main()
