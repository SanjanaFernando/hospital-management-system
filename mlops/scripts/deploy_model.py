#!/usr/bin/env python3
"""
Deploy new model version to production.

Usage:
    # List versions
    python mlops/scripts/deploy_model.py --list-versions
    
    # Activate version
    python mlops/scripts/deploy_model.py --activate v3
    
    # Deploy to backend
    python mlops/scripts/deploy_model.py \
      --version v3 \
      --copy-to model/best_ddqn_hospital_fair.pth
"""

import json
import logging
import argparse
import shutil
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mlops/logs/deployment.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def get_version_dir(version: str) -> Path:
    """Get version directory path."""
    return Path(__file__).parent.parent / 'models' / version


def get_active_version() -> dict:
    """Get currently active model version."""
    active_file = Path(__file__).parent.parent / 'models' / 'active_version.json'
    
    if not active_file.exists():
        return {'version': None, 'activated_at': None}
    
    with open(active_file, 'r') as f:
        return json.load(f)


def list_versions():
    """List all available model versions."""
    models_dir = Path(__file__).parent.parent / 'models'
    
    versions = []
    for item in models_dir.iterdir():
        if item.is_dir() and item.name.startswith('v'):
            metadata_file = item / 'metadata.json'
            performance_file = item / 'performance.json'
            
            version_info = {
                'name': item.name,
                'path': str(item),
                'model_exists': (item / 'model.pth').exists()
            }
            
            if metadata_file.exists():
                with open(metadata_file, 'r') as f:
                    meta = json.load(f)
                    version_info['trained_at'] = meta.get('trained_at', 'N/A')
                    version_info['epochs'] = meta.get('epochs_trained', 'N/A')
            
            if performance_file.exists():
                with open(performance_file, 'r') as f:
                    perf = json.load(f)
                    version_info['fairness'] = perf['metrics'].get('fairness_score', 'N/A')
                    version_info['latency_ms'] = perf['metrics'].get('inference_latency', {}).get('mean_ms', 'N/A')
            
            versions.append(version_info)
    
    return sorted(versions, key=lambda x: x['name'])


def print_versions():
    """Pretty print available versions."""
    versions = list_versions()
    active = get_active_version()
    
    print("\n" + "="*80)
    print("AVAILABLE MODEL VERSIONS")
    print("="*80)
    
    if not versions:
        print("No versions found!")
        return
    
    for v in versions:
        marker = " [ACTIVE]" if v['name'] == active['version'] else ""
        print(f"\n{v['name']}{marker}")
        print(f"  Model:    {'YES' if v['model_exists'] else 'NO'}")
        print(f"  Trained:  {v.get('trained_at', 'N/A')}")
        print(f"  Fairness: {v.get('fairness', 'N/A')}")
        print(f"  Latency:  {v.get('latency_ms', 'N/A')}ms")
    
    print("\n" + "="*80)


def activate_version(version: str):
    """Activate a model version."""
    version_dir = get_version_dir(version)
    model_file = version_dir / 'model.pth'
    
    if not version_dir.exists():
        logger.error(f"Version {version} not found at {version_dir}")
        return False
    
    if not model_file.exists():
        logger.error(f"Model file not found: {model_file}")
        return False
    
    logger.info(f"Activating version {version}...")
    
    # Load metadata
    metadata_file = version_dir / 'metadata.json'
    if metadata_file.exists():
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
        logger.info(f"  Trained at: {metadata.get('trained_at', 'N/A')}")
        logger.info(f"  Epochs: {metadata.get('epochs_trained', 'N/A')}")
    
    # Load performance
    performance_file = version_dir / 'performance.json'
    if performance_file.exists():
        with open(performance_file, 'r') as f:
            performance = json.load(f)
        metrics = performance.get('metrics', {})
        logger.info(f"  Fairness Score: {metrics.get('fairness_score', 'N/A')}")
        logger.info(f"  Efficiency Score: {metrics.get('efficiency_score', 'N/A')}")
        logger.info(f"  Avg Latency: {metrics.get('inference_latency', {}).get('mean_ms', 'N/A')}ms")
    
    # Update active version file
    active_version_file = Path(__file__).parent.parent / 'models' / 'active_version.json'
    active_config = {
        'version': version,
        'activated_at': datetime.now().isoformat(),
        'model_path': str(model_file)
    }
    
    with open(active_version_file, 'w') as f:
        json.dump(active_config, f, indent=2)
    
    logger.info(f"Version {version} is now active!")
    return True


def deploy_to_backend(version: str, destination: str):
    """Copy model to backend directory."""
    source = get_version_dir(version) / 'model.pth'
    dest = Path(destination)
    
    if not source.exists():
        logger.error(f"Source model not found: {source}")
        return False
    
    logger.info(f"Deploying {version} to {destination}...")
    
    # Backup existing model
    if dest.exists():
        backup_file = dest.parent / f"{dest.name}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(dest, backup_file)
        logger.info(f"Backed up existing model to {backup_file}")
    
    # Copy new model
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
    
    logger.info(f"Model deployed to {dest}")
    return True


def create_version_from_directory(source_dir: str, version_name: str = None):
    """Create a new version from a directory containing model.pth."""
    source_path = Path(source_dir)
    
    if not source_path.exists():
        logger.error(f"Source directory not found: {source_dir}")
        return False
    
    model_file = source_path / 'model.pth'
    if not model_file.exists():
        logger.error(f"model.pth not found in {source_dir}")
        return False
    
    # Generate version name if not provided
    if not version_name:
        versions = list_versions()
        latest_num = 0
        for v in versions:
            if v['name'].startswith('v'):
                try:
                    num = int(v['name'][1:])
                    latest_num = max(latest_num, num)
                except ValueError:
                    pass
        version_name = f"v{latest_num + 1}"
    
    target_dir = get_version_dir(version_name)
    target_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Creating version {version_name} at {target_dir}...")
    
    # Copy model file
    shutil.copy2(model_file, target_dir / 'model.pth')
    
    # Copy metadata if exists
    metadata_file = source_path / 'metadata.json'
    if metadata_file.exists():
        shutil.copy2(metadata_file, target_dir / 'metadata.json')
    
    # Copy performance if exists
    performance_file = source_path / 'performance.json'
    if performance_file.exists():
        shutil.copy2(performance_file, target_dir / 'performance.json')
    
    logger.info(f"Version {version_name} created successfully!")
    return version_name


def main():
    parser = argparse.ArgumentParser(description='Deploy model versions')
    parser.add_argument('--list-versions', action='store_true', help='List all versions')
    parser.add_argument('--activate', type=str, help='Activate a version (e.g., v3)')
    parser.add_argument('--version', type=str, help='Version to deploy (e.g., v3)')
    parser.add_argument('--copy-to', type=str, help='Copy model to destination path')
    parser.add_argument('--create-from', type=str, help='Create new version from directory')
    
    args = parser.parse_args()
    
    if args.list_versions:
        print_versions()
    
    elif args.activate:
        activate_version(args.activate)
    
    elif args.version and args.copy_to:
        deploy_to_backend(args.version, args.copy_to)
    
    elif args.create_from:
        version = create_version_from_directory(args.create_from)
        if version:
            logger.info(f"Created {version}. Activate it with: --activate {version}")
    
    else:
        parser.print_help()


if __name__ == '__main__':
    main()