import { shallowRef } from 'vue';
const token = shallowRef<string | null>(null);
export function getToken(): string | null { return token.value; }
export function setToken(value: string): void { token.value = value; }
export function clearToken(): void { token.value = null; }
