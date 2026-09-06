import { AxiosInstance } from 'axios';
import { ProductCategory, ProductTypeDefinition } from '../types';

export function createProductCategoriesApi(api: AxiosInstance) {
  return {
    /** Get all active categories with their product types */
    getAll: () =>
      api.get<{ categories: ProductCategory[]; neutralTypes: ProductTypeDefinition[] }>('/product-categories'),

    /** Create a new category */
    create: (data: { name: string; display_order?: number }) =>
      api.post<ProductCategory>('/product-categories', data),

    /** Update a category */
    update: (id: number, data: { name?: string; display_order?: number }) =>
      api.put<ProductCategory>(`/product-categories/${id}`, data),

    /** Soft-delete a category (blocked if products are assigned) */
    delete: (id: number) =>
      api.delete(`/product-categories/${id}`),

    /** Add a product type under a specific category */
    addType: (categoryId: number, data: { name: string; size_type: string; display_order?: number; measurement_template_id?: number | null }) =>
      api.post<ProductTypeDefinition>(`/product-categories/${categoryId}/types`, data),

    /** Add a neutral product type (shown for all categories) */
    addNeutralType: (data: { name: string; size_type: string; display_order?: number; measurement_template_id?: number | null }) =>
      api.post<ProductTypeDefinition>('/product-categories/neutral-types', data),

    /** Update a product type */
    updateType: (typeId: number, data: { name?: string; size_type?: string; display_order?: number; measurement_template_id?: number | null }) =>
      api.put<ProductTypeDefinition>(`/product-categories/types/${typeId}`, data),

    /** Soft-delete a product type (blocked if products use it) */
    deleteType: (typeId: number) =>
      api.delete(`/product-categories/types/${typeId}`),
  };
}
