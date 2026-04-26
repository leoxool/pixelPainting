import { createClient } from './supabase/client';
import type { SingleBrush, BrushCategory } from './supabase/types';

// Get Supabase client
const getSupabase = () => createClient();

// ============== Single Brush CRUD ==============

/**
 * Fetch all brushes for the current user
 */
export async function fetchBrushLibrary(): Promise<SingleBrush[]> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('single_brushes')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching brush library:', error);
    return [];
  }
  return data || [];
}

/**
 * Save a new single brush
 */
export async function saveSingleBrush(brush: Omit<SingleBrush, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<SingleBrush | null> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('single_brushes')
    .insert({
      ...brush,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving single brush:', error);
    return null;
  }
  return data;
}

/**
 * Update an existing single brush
 */
export async function updateSingleBrush(id: string, updates: Partial<Omit<SingleBrush, 'id' | 'user_id' | 'created_at'>>): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('single_brushes')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error updating single brush:', error);
    return false;
  }
  return true;
}

/**
 * Delete a single brush
 */
export async function deleteSingleBrush(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('single_brushes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error deleting single brush:', error);
    return false;
  }
  return true;
}

/**
 * Reorder brushes by updating sort_order
 */
export async function reorderBrushes(ids: string[]): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Update each brush's sort_order
  const updates = ids.map((id, index) =>
    supabase
      .from('single_brushes')
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
  );

  const results = await Promise.all(updates);
  const hasError = results.some(result => result.error);

  if (hasError) {
    console.error('Error reordering brushes');
    return false;
  }
  return true;
}

// ============== Brush Category CRUD ==============

/**
 * Fetch all categories for the current user
 */
export async function fetchBrushCategories(): Promise<BrushCategory[]> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('brush_categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching brush categories:', error);
    return [];
  }
  return data || [];
}

/**
 * Save a new category
 */
export async function saveBrushCategory(category: Omit<BrushCategory, 'id' | 'user_id' | 'created_at'>): Promise<BrushCategory | null> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('brush_categories')
    .insert({
      ...category,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving brush category:', error);
    return null;
  }
  return data;
}

/**
 * Update an existing category
 */
export async function updateBrushCategory(id: string, updates: Partial<Omit<BrushCategory, 'id' | 'user_id' | 'created_at'>>): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('brush_categories')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error updating brush category:', error);
    return false;
  }
  return true;
}

/**
 * Delete a category
 */
export async function deleteBrushCategory(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('brush_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error deleting brush category:', error);
    return false;
  }
  return true;
}

// ============== Utility ==============

/**
 * Generate thumbnail from full image data (100x100 -> 20x20)
 */
export function generateThumbnail(imageData: string): string {
  return imageData; // For now, return same data. In production, resize to 20x20
}
