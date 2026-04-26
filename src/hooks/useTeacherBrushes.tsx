'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { SingleBrush, BrushCategory } from '@/lib/supabase/types';
import {
  fetchBrushLibrary,
  saveSingleBrush,
  updateSingleBrush,
  deleteSingleBrush,
  reorderBrushes,
  fetchBrushCategories,
  saveBrushCategory,
  updateBrushCategory,
  deleteBrushCategory,
} from '@/lib/brushLibrary';

interface BrushLibraryContextType {
  // Single Brush Library
  brushes: SingleBrush[];
  categories: BrushCategory[];
  isLoading: boolean;
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedBrush: SingleBrush | null;
  setSelectedBrush: (brush: SingleBrush | null) => void;

  // Brush CRUD
  createBrush: (brush: Omit<SingleBrush, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<SingleBrush | null>;
  editBrush: (id: string, updates: Partial<Omit<SingleBrush, 'id' | 'user_id' | 'created_at'>>) => Promise<boolean>;
  removeBrush: (id: string) => Promise<boolean>;
  reorderBrushesList: (ids: string[]) => Promise<boolean>;
  refreshBrushes: () => Promise<void>;

  // Category CRUD
  createCategory: (category: Omit<BrushCategory, 'id' | 'user_id' | 'created_at'>) => Promise<BrushCategory | null>;
  editCategory: (id: string, updates: Partial<Omit<BrushCategory, 'id' | 'user_id' | 'created_at'>>) => Promise<boolean>;
  removeCategory: (id: string) => Promise<boolean>;
  refreshCategories: () => Promise<void>;
}

const BrushLibraryContext = createContext<BrushLibraryContextType | null>(null);

export function BrushLibraryProvider({ children }: { children: React.ReactNode }) {
  const [brushes, setBrushes] = useState<SingleBrush[]>([]);
  const [categories, setCategories] = useState<BrushCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrush, setSelectedBrush] = useState<SingleBrush | null>(null);

  // Load brushes and categories on mount
  const refreshBrushes = useCallback(async () => {
    const data = await fetchBrushLibrary();
    setBrushes(data);
  }, []);

  const refreshCategories = useCallback(async () => {
    const data = await fetchBrushCategories();
    setCategories(data);
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([refreshBrushes(), refreshCategories()]);
      setIsLoading(false);
    };
    load();
  }, [refreshBrushes, refreshCategories]);

  // Filter brushes by selected category
  const filteredBrushes = selectedCategory
    ? brushes.filter(b => b.category === selectedCategory)
    : brushes;

  // Brush CRUD
  const createBrush = useCallback(async (brush: Omit<SingleBrush, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const newBrush = await saveSingleBrush(brush);
    if (newBrush) {
      setBrushes(prev => [newBrush, ...prev]);
    }
    return newBrush;
  }, []);

  const editBrush = useCallback(async (id: string, updates: Partial<Omit<SingleBrush, 'id' | 'user_id' | 'created_at'>>) => {
    const success = await updateSingleBrush(id, updates);
    if (success) {
      setBrushes(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    }
    return success;
  }, []);

  const removeBrush = useCallback(async (id: string) => {
    const success = await deleteSingleBrush(id);
    if (success) {
      setBrushes(prev => prev.filter(b => b.id !== id));
      if (selectedBrush?.id === id) {
        setSelectedBrush(null);
      }
    }
    return success;
  }, [selectedBrush]);

  const reorderBrushesList = useCallback(async (ids: string[]) => {
    const success = await reorderBrushes(ids);
    if (success) {
      // Update local state to reflect new order
      const reordered = ids.map((id, index) => {
        const brush = brushes.find(b => b.id === id);
        return brush ? { ...brush, sort_order: index } : null;
      }).filter(Boolean) as SingleBrush[];
      setBrushes(reordered);
    }
    return success;
  }, [brushes]);

  // Category CRUD
  const createCategory = useCallback(async (category: Omit<BrushCategory, 'id' | 'user_id' | 'created_at'>) => {
    const newCategory = await saveBrushCategory(category);
    if (newCategory) {
      setCategories(prev => [...prev, newCategory]);
    }
    return newCategory;
  }, []);

  const editCategory = useCallback(async (id: string, updates: Partial<Omit<BrushCategory, 'id' | 'user_id' | 'created_at'>>) => {
    const success = await updateBrushCategory(id, updates);
    if (success) {
      setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    }
    return success;
  }, []);

  const removeCategory = useCallback(async (id: string) => {
    const success = await deleteBrushCategory(id);
    if (success) {
      setCategories(prev => prev.filter(c => c.id !== id));
      if (selectedCategory === id) {
        setSelectedCategory(null);
      }
    }
    return success;
  }, [selectedCategory]);

  const value: BrushLibraryContextType = {
    brushes: filteredBrushes,
    categories,
    isLoading,
    selectedCategory,
    setSelectedCategory,
    selectedBrush,
    setSelectedBrush,
    createBrush,
    editBrush,
    removeBrush,
    reorderBrushesList,
    refreshBrushes,
    createCategory,
    editCategory,
    removeCategory,
    refreshCategories,
  };

  return (
    <BrushLibraryContext.Provider value={value}>
      {children}
    </BrushLibraryContext.Provider>
  );
}

export function useBrushLibrary() {
  const context = useContext(BrushLibraryContext);
  if (!context) {
    throw new Error('useBrushLibrary must be used within a BrushLibraryProvider');
  }
  return context;
}
