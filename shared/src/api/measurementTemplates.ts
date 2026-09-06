import { AxiosInstance } from 'axios';
import { MeasurementTemplate } from '../types';

export function createMeasurementTemplatesApi(api: AxiosInstance) {
  return {
    /** Get all active measurement templates */
    getAll: () =>
      api.get<MeasurementTemplate[]>('/measurement-templates'),

    /** Get a single measurement template by ID */
    getById: (id: number) =>
      api.get<MeasurementTemplate>(`/measurement-templates/${id}`),

    /** Create a new measurement template */
    create: (data: { name: string; fields: { key: string; label: string; group?: string }[]; display_order?: number }) =>
      api.post<MeasurementTemplate>('/measurement-templates', data),

    /** Update a measurement template */
    update: (id: number, data: { name?: string; fields?: { key: string; label: string; group?: string }[]; display_order?: number }) =>
      api.put<MeasurementTemplate>(`/measurement-templates/${id}`, data),

    /** Soft-delete a measurement template (blocked if product types reference it) */
    delete: (id: number) =>
      api.delete(`/measurement-templates/${id}`),
  };
}
