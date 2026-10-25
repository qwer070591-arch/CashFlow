import { apiJson, ApiError } from './api';
export { ApiError };

export type HealthResponse = { status: 'ok'; service: string };
export const getApiHealth = () => apiJson<HealthResponse>('/api/health');
export const getDatabaseHealth = () => apiJson<HealthResponse>('/api/health/db');
