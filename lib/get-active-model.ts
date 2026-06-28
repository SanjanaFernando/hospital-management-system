/**
 * Utility to load active model version for inference
 * Reads from mlops/models/active_version.json
 */

import fs from 'fs';
import path from 'path';

interface ActiveVersionConfig {
  version: string;
  activated_at: string;
  model_path: string;
  status: string;
}

/**
 * Get path to the currently active model
 * Falls back to default if config not found
 */
export function getActiveModelPath(): string {
  try {
    const configPath = path.join(process.cwd(), 'mlops', 'models', 'active_version.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ActiveVersionConfig;
      const modelPath = path.join(process.cwd(), config.model_path);
      
      if (fs.existsSync(modelPath)) {
        return modelPath;
      }
    }
  } catch (error) {
    console.warn('Failed to load active model config, using default:', error);
  }
  
  // Fallback to default model
  return path.join(process.cwd(), 'model', 'best_ddqn_hospital_fair.pth');
}

/**
 * Get metadata about the active model version
 */
export function getActiveModelMetadata(): ActiveVersionConfig | null {
  try {
    const configPath = path.join(process.cwd(), 'mlops', 'models', 'active_version.json');
    
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ActiveVersionConfig;
    }
  } catch (error) {
    console.warn('Failed to load model metadata:', error);
  }
  
  return null;
}

/**
 * List all available model versions
 */
export function listAvailableModels(): string[] {
  try {
    const modelsDir = path.join(process.cwd(), 'mlops', 'models');
    
    if (!fs.existsSync(modelsDir)) {
      return [];
    }
    
    return fs.readdirSync(modelsDir)
      .filter(name => name.startsWith('v') && fs.statSync(path.join(modelsDir, name)).isDirectory())
      .sort();
  } catch (error) {
    console.warn('Failed to list models:', error);
    return [];
  }
}
