#!/usr/bin/env python3
"""
Monitor model inference performance in production.

Usage:
    python mlops/scripts/monitor_inference.py --log-file mlops/logs/inference/latest.log
"""

import json
import logging
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def parse_inference_logs(log_file: str, hours: int = 24) -> dict:
    """Parse inference logs to extract metrics."""
    
    cutoff_time = datetime.now() - timedelta(hours=hours)
    
    stats = {
        'total_inferences': 0,
        'successful': 0,
        'failed': 0,
        'fallback_to_priority': 0,
        'latencies': [],
        'strategies': defaultdict(int),
        'errors': []
    }
    
    try:
        with open(log_file, 'r') as f:
            for line in f:
                if not line.strip():
                    continue
                
                try:
                    # Parse JSON log entry
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                
                # Extract timestamp
                try:
                    timestamp = datetime.fromisoformat(entry.get('timestamp', ''))
                    if timestamp < cutoff_time:
                        continue
                except:
                    pass
                
                stats['total_inferences'] += 1
                
                # Track strategy
                strategy = entry.get('strategy', 'unknown')
                stats['strategies'][strategy] += 1
                
                # Track latency
                if 'latency_ms' in entry:
                    stats['latencies'].append(entry['latency_ms'])
                
                # Track success/failure
                if entry.get('success', False):
                    stats['successful'] += 1
                else:
                    stats['failed'] += 1
                    stats['fallback_to_priority'] += 1
                
                # Track errors
                if 'error' in entry:
                    stats['errors'].append(entry['error'])
    
    except FileNotFoundError:
        logger.warning(f"Log file not found: {log_file}")
    
    return stats


def calculate_summary(stats: dict) -> dict:
    """Calculate summary metrics."""
    import numpy as np
    
    latencies = stats.get('latencies', [])
    
    summary = {
        'total_inferences': stats['total_inferences'],
        'success_rate': (stats['successful'] / stats['total_inferences'] * 100) if stats['total_inferences'] > 0 else 0,
        'fallback_rate': (stats['fallback_to_priority'] / stats['total_inferences'] * 100) if stats['total_inferences'] > 0 else 0,
        'latency_stats': {
            'mean_ms': float(np.mean(latencies)) if latencies else 0,
            'median_ms': float(np.median(latencies)) if latencies else 0,
            'std_ms': float(np.std(latencies)) if latencies else 0,
            'min_ms': float(np.min(latencies)) if latencies else 0,
            'max_ms': float(np.max(latencies)) if latencies else 0,
        },
        'strategy_distribution': dict(stats['strategies']),
        'errors': stats['errors'][:10]  # Last 10 errors
    }
    
    return summary


def main():
    parser = argparse.ArgumentParser(description='Monitor inference performance')
    parser.add_argument('--log-file', type=str, default='mlops/logs/inference/latest.log',
                       help='Inference log file')
    parser.add_argument('--hours', type=int, default=24, help='Hours of logs to analyze')
    parser.add_argument('--output', type=str, default=None, help='Output file for metrics')
    
    args = parser.parse_args()
    
    logger.info(f"Analyzing inference logs from {args.log_file} (last {args.hours} hours)...")
    
    stats = parse_inference_logs(args.log_file, args.hours)
    summary = calculate_summary(stats)
    
    # Print summary
    print("\n" + "="*60)
    print("INFERENCE MONITORING SUMMARY")
    print("="*60)
    print(f"Total Inferences: {summary['total_inferences']}")
    print(f"Success Rate: {summary['success_rate']:.2f}%")
    print(f"Fallback Rate: {summary['fallback_rate']:.2f}%")
    print(f"\nLatency Statistics:")
    print(f"  Mean: {summary['latency_stats']['mean_ms']:.2f}ms")
    print(f"  Median: {summary['latency_stats']['median_ms']:.2f}ms")
    print(f"  Std Dev: {summary['latency_stats']['std_ms']:.2f}ms")
    print(f"\nStrategy Distribution:")
    for strategy, count in summary['strategy_distribution'].items():
        print(f"  {strategy}: {count}")
    print("="*60 + "\n")
    
    # Save metrics if output specified
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(summary, f, indent=2)
        logger.info(f"Metrics saved to {args.output}")


if __name__ == '__main__':
    main()
